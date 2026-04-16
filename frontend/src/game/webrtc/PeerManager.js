import Peer from 'peerjs';
import { ICE_SERVERS, PEER_CONFIG } from './webrtcConfig';

const MAX_CONNECT_RETRIES = 6;
const STREAM_ESTABLISH_TIMEOUT_MS = 6000;
const CONNECT_ATTEMPT_COOLDOWN_MS = 1000;
const NETWORK_DIAG_STORAGE_KEY = 'pixel_office_net_diag';

function isNetworkDiagnosticsEnabled() {
  let queryEnabled = false;
  try {
    const params = new URLSearchParams(window.location.search);
    queryEnabled =
      params.get('netDiag') === '1' ||
      params.get('diag') === '1' ||
      params.get('networkDebug') === '1';
  } catch {
    queryEnabled = false;
  }

  let storageEnabled = false;
  try {
    storageEnabled = window.localStorage.getItem(NETWORK_DIAG_STORAGE_KEY) === '1';
  } catch {
    storageEnabled = false;
  }

  return Boolean(queryEnabled || storageEnabled);
}

function sanitizePeerId(id) {
  return String(id || '').replace(/[^0-9a-z]/gi, 'G');
}

export class PeerManager {
  constructor(room, localStream, videoOverlay, mediaControls = null) {
    this.room = room;
    this.localStream = localStream || null;
    this.videoOverlay = videoOverlay;
    this.mediaControls = mediaControls;
    this.peer = null;
    this.initialized = false;
    this.destroyed = false;
    this.localPeerId = null;
    this.sessionPeerIds = new Map();
    this.peerIdToSessionId = new Map();
    this.outgoingCalls = new Map();
    this.incomingCalls = new Map();
    this.retryCounts = new Map();
    this.connectionState = new Map();
    this.lastConnectAttempt = new Map();
    this.deferredConnectTimers = new Map();
    this.messageHandler = (message) => this.handlePeerIdMessage(message);
    this.networkDiagnosticsEnabled = isNetworkDiagnosticsEnabled();
  }

  diag(label, payload = {}) {
    if (!this.networkDiagnosticsEnabled) {
      return;
    }

    console.log(`[DIAG][webrtc][PeerManager][${label}]`, {
      ts: Date.now(),
      sessionId: this.room?.sessionId,
      localPeerId: this.localPeerId,
      ...payload,
    });
  }

  getSessionIdForPeer(peerId) {
    return this.peerIdToSessionId.get(peerId) || peerId;
  }

  getOutboundStream() {
    const liveStream = this.mediaControls?.getStream?.();
    if (liveStream instanceof MediaStream) {
      this.localStream = liveStream;
      return liveStream;
    }

    if (this.localStream instanceof MediaStream) {
      return this.localStream;
    }

    return new MediaStream();
  }

  setLocalStream(stream) {
    this.localStream = stream instanceof MediaStream ? stream : null;
    this.diag('set-local-stream', {
      hasStream: Boolean(this.localStream),
      audioTracks: this.localStream?.getAudioTracks?.().length || 0,
      videoTracks: this.localStream?.getVideoTracks?.().length || 0,
    });
    void this.syncActiveCallTracks();
  }

  async syncActiveCallTracks() {
    const stream = this.getOutboundStream();
    const audioTrack = stream.getAudioTracks?.()[0] || null;
    const videoTrack = stream.getVideoTracks?.()[0] || null;

    const updates = [];
    const calls = [
      ...this.outgoingCalls.values(),
      ...this.incomingCalls.values(),
    ];

    calls.forEach((entry) => {
      const senders = entry?.call?.peerConnection?.getSenders?.() || [];
      senders.forEach((sender) => {
        if (sender?.track?.kind === 'audio') {
          updates.push(sender.replaceTrack(audioTrack));
        } else if (sender?.track?.kind === 'video') {
          updates.push(sender.replaceTrack(videoTrack));
        }
      });
    });

    if (updates.length > 0) {
      this.diag('sync-active-call-tracks', {
        senderUpdates: updates.length,
        activeOutgoingCalls: this.outgoingCalls.size,
        activeIncomingCalls: this.incomingCalls.size,
      });
      await Promise.allSettled(updates);
    }
  }

  getLocalMediaState() {
    const stream = this.getOutboundStream();
    const videoTracks = stream?.getVideoTracks?.() || [];
    const audioTracks = stream?.getAudioTracks?.() || [];

    const videoEnabled = videoTracks.length > 0
      ? videoTracks.some((track) => track.enabled !== false)
      : false;
    const audioEnabled = audioTracks.length > 0
      ? audioTracks.some((track) => track.enabled !== false)
      : false;

    return { videoEnabled, audioEnabled };
  }

  getDisplayKey(sessionId, peerId) {
    if (sessionId && this.sessionPeerIds.has(sessionId)) {
      return sessionId;
    }

    return sessionId || peerId;
  }

  upsertRemoteStream(peerId, stream, preferredSessionId = null) {
    const mappedSessionId = preferredSessionId || this.getSessionIdForPeer(peerId);
    const streamKey = this.getDisplayKey(mappedSessionId, peerId);
    this.videoOverlay?.addStream?.(streamKey, stream, this.getProfile(mappedSessionId));
  }

  removeRemoteStream(peerId) {
    const mappedSessionId = this.getSessionIdForPeer(peerId);
    const streamKey = this.getDisplayKey(mappedSessionId, peerId);
    this.videoOverlay?.removeStream?.(streamKey);
  }

  async init() {
    if (this.initialized) {
      return this.peer;
    }

    const sessionId = this.room?.sessionId;
    if (!sessionId) {
      throw new Error('Room session ID is not available for PeerJS initialization');
    }

    this.localPeerId = sanitizePeerId(sessionId);
    this.diag('init-start', {
      initialLocalPeerId: this.localPeerId,
    });

    // Wait for the Peer to actually be ready before proceeding
    const peerReadyPromise = new Promise((resolve, reject) => {
      const peer = new Peer(this.localPeerId, {
        ...PEER_CONFIG,
        config: { iceServers: ICE_SERVERS },
      });

      const onOpen = (peerId) => {
        cleanup();
        this.localPeerId = sanitizePeerId(peerId);
        this.diag('peer-open', { peerId: this.localPeerId });
        this.broadcastLocalPeerId();
        resolve(peer);
      };

      const onError = (error) => {
        console.error('[PeerManager:init] PeerJS initialization error:', error);
        cleanup();
        reject(error);
      };

      const timeout = setTimeout(() => {
        console.error('[PeerManager:init] Peer initialization timeout');
        cleanup();
        reject(new Error('PeerJS initialization timeout'));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        peer.off('open', onOpen);
        peer.off('error', onError);
      };

      peer.on('open', onOpen);
      peer.on('error', onError);

      // Listen for calls globally
      peer.on('call', (call) => {
        this.diag('peer-incoming-call-event', {
          fromPeerId: call?.peer,
        });
        this.handleIncomingCall(call);
      });

      peer.on('disconnected', () => {
        console.warn('[PeerManager:disconnected] PeerJS disconnected');
        this.diag('peer-disconnected');
      });
    });

    try {
      this.peer = await peerReadyPromise;
    } catch (error) {
      console.error('[PeerManager] Failed to initialize peer:', error);
      throw error;
    }
    this.room?.onMessage?.('peer-id', this.messageHandler);
    this.diag('init-complete');

    this.initialized = true;

    return this.peer;
  }

  broadcastLocalPeerId() {
    if (!this.room || !this.localPeerId) {
      console.warn('[PeerManager:broadcast] Cannot broadcast - room or peerId missing', {
        hasRoom: !!this.room,
        peerId: this.localPeerId,
      });
      return;
    }

    try {
      this.diag('broadcast-local-peer-id', {
        peerId: this.localPeerId,
      });
      this.room.send('peer-id', { peerId: this.localPeerId });
    } catch (error) {
      console.error('[PeerManager:broadcast] Failed to broadcast local peer id', error);
    }
  }

  handlePeerIdMessage(message) {
    if (this.destroyed || !message || typeof message !== 'object') {
      console.warn('[PeerManager:handlePeerIdMessage] Invalid message', { destroyed: this.destroyed, message });
      return;
    }

    const { sessionId, peerId } = message;
    if (typeof sessionId !== 'string' || typeof peerId !== 'string') {
      console.warn('[PeerManager:handlePeerIdMessage] Invalid sessionId or peerId', { sessionId, peerId });
      return;
    }

    const sanitizedPeerId = sanitizePeerId(peerId);
    this.diag('peer-id-message', {
      remoteSessionId: sessionId,
      remotePeerId: sanitizedPeerId,
    });
    this.sessionPeerIds.set(sessionId, sanitizedPeerId);
    this.peerIdToSessionId.set(sanitizedPeerId, sessionId);
    this.videoOverlay?.replaceStreamKey?.(sanitizedPeerId, sessionId);
    this.videoOverlay?.updateProfile?.(sessionId, this.getProfile(sessionId));
  }

  getUsername(sessionId) {
    const player = this.room?.state?.players?.get?.(sessionId);
    return player?.username || player?.name || '';
  }

  getProfile(sessionId) {
    const player = this.room?.state?.players?.get?.(sessionId);
    return {
      name: player?.username || player?.name || '',
      characterKey: player?.characterKey || '',
    };
  }

  resolvePeerId(sessionId) {
    return this.sessionPeerIds.get(sessionId) || sanitizePeerId(sessionId);
  }

  isConnected(sessionId) {
    const peerId = this.resolvePeerId(sessionId);
    return this.outgoingCalls.has(peerId) || this.incomingCalls.has(peerId);
  }

  getConnectionState(sessionId) {
    const peerId = this.resolvePeerId(sessionId);
    return this.connectionState.get(peerId) || 'idle';
  }

  setConnectionStateForPeer(peerId, state, onlyIfTracked = false) {
    if (!peerId) {
      return;
    }

    if (onlyIfTracked && !this.connectionState.has(peerId)) {
      return;
    }

    this.connectionState.set(peerId, state);
  }

  clearConnectionStateForPeer(peerId) {
    if (!peerId) {
      return;
    }

    this.connectionState.delete(peerId);
  }

  getActiveConnection(sessionId) {
    const peerId = this.resolvePeerId(sessionId);
    return this.outgoingCalls.get(peerId) || this.incomingCalls.get(peerId) || null;
  }

  shouldInitiateCall(sessionId) {
    const localSessionId = this.room?.sessionId;
    if (!localSessionId || !sessionId) {
      return true;
    }

    // Deterministic tie-breaker: only one side initiates, the other side waits for incoming.
    return String(localSessionId) < String(sessionId);
  }

  connectToPeer(sessionId, attempt = 0) {
    if (this.destroyed || !this.peer || !sessionId || sessionId === this.room?.sessionId) {
      console.warn('[PeerManager:connectToPeer] Cannot connect - preconditions failed', {
        destroyed: this.destroyed,
        hasPeer: !!this.peer,
        sessionId,
        isLocal: sessionId === this.room?.sessionId,
      });
      return null;
    }

    const peerId = this.resolvePeerId(sessionId);
    if (!peerId) {
      console.warn('[PeerManager:connectToPeer] Could not resolve peerId for sessionId:', sessionId);
      return null;
    }

    const state = this.connectionState.get(peerId) || 'idle';
    if (state === 'connecting' || state === 'connected') {
      return this.getActiveConnection(sessionId);
    }

    const now = Date.now();
    const lastAttempt = this.lastConnectAttempt.get(peerId) || 0;
    if (now - lastAttempt < CONNECT_ATTEMPT_COOLDOWN_MS) {
      return this.getActiveConnection(sessionId);
    }

    if (!this.shouldInitiateCall(sessionId) && attempt === 0) {
      if (this.deferredConnectTimers.has(peerId)) {
        return this.getActiveConnection(sessionId);
      }

      this.lastConnectAttempt.set(peerId, now);
      this.diag('connect-defer-deterministic', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
      });

      // Prefer deterministic single-side dialing, but keep a fallback attempt in case
      // peer-id mapping arrives late and the initiator side misses its first call window.
      const timerId = window.setTimeout(() => {
        this.deferredConnectTimers.delete(peerId);
        if (!this.isConnected(sessionId) && !this.destroyed) {
          this.connectToPeer(sessionId, 1);
        }
      }, 350);
      this.deferredConnectTimers.set(peerId, timerId);
      return this.getActiveConnection(sessionId);
    }

    if (this.outgoingCalls.has(peerId) || this.incomingCalls.has(peerId)) {
      return this.getActiveConnection(sessionId);
    }

    this.lastConnectAttempt.set(peerId, now);
    this.setConnectionStateForPeer(peerId, 'connecting');

    const outboundStream = this.getOutboundStream();

    const localSessionId = this.room?.sessionId || '';
    const localMediaState = this.getLocalMediaState();
    const call = this.peer.call(peerId, outboundStream, {
      metadata: {
        fromSessionId: localSessionId,
        videoEnabled: localMediaState.videoEnabled,
        audioEnabled: localMediaState.audioEnabled,
      },
    });

    if (!call) {
      this.setConnectionStateForPeer(peerId, 'idle', true);
      this.diag('connect-call-failed-null', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
      });
      return null;
    }

    this.diag('connect-call-start', {
      remoteSessionId: sessionId,
      remotePeerId: peerId,
      attempt,
      outboundAudioTracks: outboundStream.getAudioTracks?.().length || 0,
      outboundVideoTracks: outboundStream.getVideoTracks?.().length || 0,
    });

    const record = { call, stream: null, sessionId, peerId };
    this.outgoingCalls.set(peerId, record);

    record.streamTimeoutId = window.setTimeout(() => {
      if (this.destroyed) {
        return;
      }
      const current = this.outgoingCalls.get(peerId);
      if (!current || current.stream) {
        return;
      }

      this.diag('outgoing-call-stream-timeout', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
        timeoutMs: STREAM_ESTABLISH_TIMEOUT_MS,
      });

      try {
        current.call?.close?.();
      } catch {
        // Ignore close errors while recovering stale calls.
      }
    }, STREAM_ESTABLISH_TIMEOUT_MS);

    call.on('stream', (stream) => {
      record.stream = stream;
      this.setConnectionStateForPeer(peerId, 'connected', true);
      if (record.streamTimeoutId) {
        window.clearTimeout(record.streamTimeoutId);
        record.streamTimeoutId = null;
      }
      this.diag('outgoing-call-stream', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
        audioTracks: stream?.getAudioTracks?.().length || 0,
        videoTracks: stream?.getVideoTracks?.().length || 0,
      });
      this.upsertRemoteStream(peerId, stream, sessionId);
    });

    call.on('close', () => {
      const hadStream = Boolean(record.stream);
      this.setConnectionStateForPeer(peerId, 'idle', true);
      if (record.streamTimeoutId) {
        window.clearTimeout(record.streamTimeoutId);
        record.streamTimeoutId = null;
      }
      this.diag('outgoing-call-close', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
        hadStream,
      });
      this.removeRemoteStream(peerId);
      this.outgoingCalls.delete(peerId);

      const retryCount = this.retryCounts.get(peerId) || 0;
      if (!hadStream && retryCount < MAX_CONNECT_RETRIES && !this.destroyed) {
        this.diag('outgoing-call-retry-scheduled', {
          remoteSessionId: sessionId,
          remotePeerId: peerId,
          retryAttempt: retryCount + 1,
        });
        this.retryCounts.set(peerId, retryCount + 1);
        window.setTimeout(() => {
          this.connectToPeer(sessionId, retryCount + 1);
        }, 250 + retryCount * 150);
        return;
      }

      this.retryCounts.delete(peerId);
    });

    call.on('error', (error) => {
      console.warn('Outgoing PeerJS call error', { sessionId, error });
      this.setConnectionStateForPeer(peerId, 'idle', true);
      if (record.streamTimeoutId) {
        window.clearTimeout(record.streamTimeoutId);
        record.streamTimeoutId = null;
      }
      this.diag('outgoing-call-error', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.outgoingCalls.delete(peerId);
      this.removeRemoteStream(peerId);

      const retryCount = this.retryCounts.get(peerId) || 0;
      if (retryCount < MAX_CONNECT_RETRIES && !this.destroyed) {
        this.diag('outgoing-call-error-retry-scheduled', {
          remoteSessionId: sessionId,
          remotePeerId: peerId,
          retryAttempt: retryCount + 1,
        });
        this.retryCounts.set(peerId, retryCount + 1);
        window.setTimeout(() => {
          this.connectToPeer(sessionId, retryCount + 1);
        }, 250 + retryCount * 150);
      }
    });

    return record;
  }

  handleIncomingCall(call) {
    if (this.destroyed || !call) {
      return;
    }

    const peerId = sanitizePeerId(call.peer);
    this.diag('incoming-call-start', {
      remotePeerId: peerId,
      metadata: call?.metadata || null,
    });
    if (this.incomingCalls.has(peerId)) {
      call.close();
      return;
    }

    this.setConnectionStateForPeer(peerId, 'connecting');

    // If there is an outgoing call race, prefer the incoming call and replace the outgoing one.
    const outgoing = this.outgoingCalls.get(peerId);
    if (outgoing?.call) {
      try {
        outgoing.call.close();
      } catch {
        // Ignore close errors during race resolution.
      }
      this.outgoingCalls.delete(peerId);
    }

    const answerStream = this.getOutboundStream();

    const sessionId =
      this.peerIdToSessionId.get(peerId) ||
      call.metadata?.fromSessionId ||
      call.metadata?.sessionId ||
      peerId;
    const record = { call, stream: null, sessionId, peerId };
    this.incomingCalls.set(peerId, record);

    record.streamTimeoutId = window.setTimeout(() => {
      if (this.destroyed) {
        return;
      }
      const current = this.incomingCalls.get(peerId);
      if (!current || current.stream) {
        return;
      }

      this.diag('incoming-call-stream-timeout', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
        timeoutMs: STREAM_ESTABLISH_TIMEOUT_MS,
      });

      try {
        current.call?.close?.();
      } catch {
        // Ignore close errors while recovering stale calls.
      }
    }, STREAM_ESTABLISH_TIMEOUT_MS);

    if (typeof call.metadata?.videoEnabled === 'boolean' || typeof call.metadata?.audioEnabled === 'boolean') {
      this.videoOverlay?.updateRemoteMediaState?.(sessionId, {
        videoEnabled: call.metadata?.videoEnabled,
        audioEnabled: call.metadata?.audioEnabled,
      });
    }

    try {
      call.answer(answerStream);
      this.diag('incoming-call-answered', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
        answerAudioTracks: answerStream.getAudioTracks?.().length || 0,
        answerVideoTracks: answerStream.getVideoTracks?.().length || 0,
      });
    } catch (error) {
      console.warn('Failed to answer incoming PeerJS call', { peerId, error });
      this.setConnectionStateForPeer(peerId, 'idle', true);
      this.incomingCalls.delete(peerId);
      call.close();
      return;
    }

    call.on('stream', (stream) => {
      record.stream = stream;
      this.setConnectionStateForPeer(peerId, 'connected', true);
      if (record.streamTimeoutId) {
        window.clearTimeout(record.streamTimeoutId);
        record.streamTimeoutId = null;
      }
      this.diag('incoming-call-stream', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
        audioTracks: stream?.getAudioTracks?.().length || 0,
        videoTracks: stream?.getVideoTracks?.().length || 0,
      });
      this.upsertRemoteStream(peerId, stream, sessionId);
    });

    call.on('close', () => {
      this.setConnectionStateForPeer(peerId, 'idle', true);
      if (record.streamTimeoutId) {
        window.clearTimeout(record.streamTimeoutId);
        record.streamTimeoutId = null;
      }
      this.diag('incoming-call-close', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
      });
      this.removeRemoteStream(peerId);
      this.incomingCalls.delete(peerId);
      this.retryCounts.delete(peerId);
    });

    call.on('error', (error) => {
      console.warn('Incoming PeerJS call error', { peerId, error });
      this.setConnectionStateForPeer(peerId, 'idle', true);
      if (record.streamTimeoutId) {
        window.clearTimeout(record.streamTimeoutId);
        record.streamTimeoutId = null;
      }
      this.diag('incoming-call-error', {
        remoteSessionId: sessionId,
        remotePeerId: peerId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.incomingCalls.delete(peerId);
      this.removeRemoteStream(peerId);
    });
  }

  disconnectFromPeer(sessionId) {
    const peerId = this.resolvePeerId(sessionId);
    this.diag('disconnect-peer', {
      remoteSessionId: sessionId,
      remotePeerId: peerId,
      hadOutgoing: this.outgoingCalls.has(peerId),
      hadIncoming: this.incomingCalls.has(peerId),
    });

    const outgoing = this.outgoingCalls.get(peerId);
    if (outgoing?.streamTimeoutId) {
      window.clearTimeout(outgoing.streamTimeoutId);
      outgoing.streamTimeoutId = null;
    }
    if (outgoing?.call) {
      outgoing.call.close();
    }
    this.outgoingCalls.delete(peerId);

    const incoming = this.incomingCalls.get(peerId);
    if (incoming?.streamTimeoutId) {
      window.clearTimeout(incoming.streamTimeoutId);
      incoming.streamTimeoutId = null;
    }
    if (incoming?.call) {
      incoming.call.close();
    }
    this.incomingCalls.delete(peerId);

    this.retryCounts.delete(peerId);
    this.lastConnectAttempt.delete(peerId);
    const deferredTimer = this.deferredConnectTimers.get(peerId);
    if (deferredTimer) {
      window.clearTimeout(deferredTimer);
      this.deferredConnectTimers.delete(peerId);
    }
    this.clearConnectionStateForPeer(peerId);
    this.removeRemoteStream(peerId);
    return true;
  }

  getConnectedSessionIds() {
    const connected = new Set();

    this.outgoingCalls.forEach((entry, peerId) => {
      connected.add(entry?.sessionId || this.getSessionIdForPeer(peerId));
    });

    this.incomingCalls.forEach((entry, peerId) => {
      connected.add(entry?.sessionId || this.getSessionIdForPeer(peerId));
    });

    return connected;
  }

  destroy() {
    this.destroyed = true;
    this.diag('destroy-start', {
      outgoingCalls: this.outgoingCalls.size,
      incomingCalls: this.incomingCalls.size,
    });

    const peerIds = new Set([
      ...this.outgoingCalls.keys(),
      ...this.incomingCalls.keys(),
    ]);

    peerIds.forEach((peerId) => {
      const outgoing = this.outgoingCalls.get(peerId);
      if (outgoing?.streamTimeoutId) {
        window.clearTimeout(outgoing.streamTimeoutId);
        outgoing.streamTimeoutId = null;
      }
      const incoming = this.incomingCalls.get(peerId);
      if (incoming?.streamTimeoutId) {
        window.clearTimeout(incoming.streamTimeoutId);
        incoming.streamTimeoutId = null;
      }
      this.outgoingCalls.get(peerId)?.call?.close();
      this.incomingCalls.get(peerId)?.call?.close();
    });

    this.outgoingCalls.clear();
    this.incomingCalls.clear();
    this.sessionPeerIds.clear();
    this.peerIdToSessionId.clear();
    this.retryCounts.clear();
    this.connectionState.clear();
    this.lastConnectAttempt.clear();
    this.deferredConnectTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    this.deferredConnectTimers.clear();

    try {
      this.peer?.destroy?.();
    } catch (error) {
      console.warn('Failed to destroy PeerJS peer', error);
    }

    this.peer = null;
    this.room = null;
    this.localStream = null;
    this.videoOverlay = null;
    this.mediaControls = null;
    this.diag('destroy-complete');
  }
}

export default PeerManager;