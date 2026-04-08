import Peer from 'peerjs';
import { ICE_SERVERS, PEER_CONFIG } from './webrtcConfig';

function sanitizePeerId(id) {
  return String(id || '').replace(/[^0-9a-z]/gi, 'G');
}

export class PeerManager {
  constructor(room, localStream, videoOverlay) {
    this.room = room;
    this.localStream = localStream || null;
    this.videoOverlay = videoOverlay;
    this.peer = null;
    this.initialized = false;
    this.destroyed = false;
    this.localPeerId = null;
    this.sessionPeerIds = new Map();
    this.peerIdToSessionId = new Map();
    this.outgoingCalls = new Map();
    this.incomingCalls = new Map();
    this.retryCounts = new Map();
    this.messageHandler = (message) => this.handlePeerIdMessage(message);
  }

  getSessionIdForPeer(peerId) {
    return this.peerIdToSessionId.get(peerId) || peerId;
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
    this.videoOverlay?.addStream?.(streamKey, stream, this.getUsername(mappedSessionId));
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

    console.log('[PeerManager] Initializing with sessionId:', sessionId);

    this.localPeerId = sanitizePeerId(sessionId);
    console.log('[PeerManager] Initial peerId:', this.localPeerId);

    // Wait for the Peer to actually be ready before proceeding
    const peerReadyPromise = new Promise((resolve, reject) => {
      const peer = new Peer(this.localPeerId, {
        ...PEER_CONFIG,
        config: { iceServers: ICE_SERVERS },
      });

      const onOpen = (peerId) => {
        console.log('[PeerManager:open] Peer opened with ID:', peerId);
        cleanup();
        this.localPeerId = sanitizePeerId(peerId);
        console.log('[PeerManager:open] Final peerId:', this.localPeerId);
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
        console.log('[PeerManager:call] Incoming call from:', call.peer);
        this.handleIncomingCall(call);
      });

      peer.on('disconnected', () => {
        console.warn('[PeerManager:disconnected] PeerJS disconnected');
      });
    });

    try {
      this.peer = await peerReadyPromise;
    } catch (error) {
      console.error('[PeerManager] Failed to initialize peer:', error);
      throw error;
    }

    console.log('[PeerManager] Registering peer-id message handler with room');
    this.room?.onMessage?.('peer-id', this.messageHandler);

    this.initialized = true;
    console.log('[PeerManager] Initialization complete');

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
      console.log('[PeerManager:broadcast] Sending peer-id message:', this.localPeerId);
      this.room.send('peer-id', { peerId: this.localPeerId });
      console.log('[PeerManager:broadcast] Successfully sent peer-id message');
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

    console.log('[PeerManager:handlePeerIdMessage] Received mapping:', { sessionId, peerId });

    const sanitizedPeerId = sanitizePeerId(peerId);
    this.sessionPeerIds.set(sessionId, sanitizedPeerId);
    this.peerIdToSessionId.set(sanitizedPeerId, sessionId);

    console.log('[PeerManager:handlePeerIdMessage] Maps updated, attempting key migration');
    this.videoOverlay?.replaceStreamKey?.(sanitizedPeerId, sessionId);
    this.videoOverlay?.updateUsername?.(sessionId, this.getUsername(sessionId));
  }

  getUsername(sessionId) {
    const player = this.room?.state?.players?.get?.(sessionId);
    return player?.username || player?.name || '';
  }

  resolvePeerId(sessionId) {
    return this.sessionPeerIds.get(sessionId) || sanitizePeerId(sessionId);
  }

  isConnected(sessionId) {
    const peerId = this.resolvePeerId(sessionId);
    return this.outgoingCalls.has(peerId) || this.incomingCalls.has(peerId);
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

    if (!this.shouldInitiateCall(sessionId)) {
      return this.getActiveConnection(sessionId);
    }

    console.log('[PeerManager:connectToPeer] Attempting connection', { sessionId, peerId, attempt });

    if (this.outgoingCalls.has(peerId) || this.incomingCalls.has(peerId)) {
      console.log('[PeerManager:connectToPeer] Already connected to', peerId);
      return this.getActiveConnection(sessionId);
    }

    if (!this.localStream) {
      console.error('[PeerManager:connectToPeer] No local stream available!', { sessionId, peerId });
      return null;
    }

    console.log('[PeerManager:connectToPeer] Stream available, proceeding with call', { sessionId, peerId });

    const call = this.peer.call(peerId, this.localStream, {
      metadata: {
        sessionId,
      },
    });

    if (!call) {
      return null;
    }

    const record = { call, stream: null, sessionId, peerId };
    this.outgoingCalls.set(peerId, record);

    call.on('stream', (stream) => {
      record.stream = stream;
      this.upsertRemoteStream(peerId, stream, sessionId);
    });

    call.on('close', () => {
      const hadStream = Boolean(record.stream);
      this.removeRemoteStream(peerId);
      this.outgoingCalls.delete(peerId);

      const retryCount = this.retryCounts.get(peerId) || 0;
      if (!hadStream && retryCount < 1 && !this.destroyed) {
        this.retryCounts.set(peerId, retryCount + 1);
        window.setTimeout(() => {
          this.connectToPeer(sessionId, retryCount + 1);
        }, 250);
        return;
      }

      this.retryCounts.delete(peerId);
    });

    call.on('error', (error) => {
      console.warn('Outgoing PeerJS call error', { sessionId, error });
      this.outgoingCalls.delete(peerId);
      this.removeRemoteStream(peerId);

      const retryCount = this.retryCounts.get(peerId) || 0;
      if (retryCount < 1 && !this.destroyed) {
        this.retryCounts.set(peerId, retryCount + 1);
        window.setTimeout(() => {
          this.connectToPeer(sessionId, retryCount + 1);
        }, 250);
      }
    });

    return record;
  }

  handleIncomingCall(call) {
    if (this.destroyed || !call) {
      return;
    }

    const peerId = sanitizePeerId(call.peer);
    if (this.incomingCalls.has(peerId)) {
      call.close();
      return;
    }

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

    if (!this.localStream) {
      call.close();
      return;
    }

    const sessionId = this.peerIdToSessionId.get(peerId) || call.metadata?.sessionId || peerId;
    const record = { call, stream: null, sessionId, peerId };
    this.incomingCalls.set(peerId, record);

    try {
      call.answer(this.localStream);
    } catch (error) {
      console.warn('Failed to answer incoming PeerJS call', { peerId, error });
      this.incomingCalls.delete(peerId);
      call.close();
      return;
    }

    call.on('stream', (stream) => {
      record.stream = stream;
      this.upsertRemoteStream(peerId, stream, sessionId);
    });

    call.on('close', () => {
      this.removeRemoteStream(peerId);
      this.incomingCalls.delete(peerId);
      this.retryCounts.delete(peerId);
    });

    call.on('error', (error) => {
      console.warn('Incoming PeerJS call error', { peerId, error });
      this.incomingCalls.delete(peerId);
      this.removeRemoteStream(peerId);
    });
  }

  disconnectFromPeer(sessionId) {
    const peerId = this.resolvePeerId(sessionId);

    const outgoing = this.outgoingCalls.get(peerId);
    if (outgoing?.call) {
      outgoing.call.close();
    }
    this.outgoingCalls.delete(peerId);

    const incoming = this.incomingCalls.get(peerId);
    if (incoming?.call) {
      incoming.call.close();
    }
    this.incomingCalls.delete(peerId);

    this.retryCounts.delete(peerId);
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

    const peerIds = new Set([
      ...this.outgoingCalls.keys(),
      ...this.incomingCalls.keys(),
    ]);

    peerIds.forEach((peerId) => {
      this.outgoingCalls.get(peerId)?.call?.close();
      this.incomingCalls.get(peerId)?.call?.close();
    });

    this.outgoingCalls.clear();
    this.incomingCalls.clear();
    this.sessionPeerIds.clear();
    this.peerIdToSessionId.clear();
    this.retryCounts.clear();

    try {
      this.peer?.destroy?.();
    } catch (error) {
      console.warn('Failed to destroy PeerJS peer', error);
    }

    this.peer = null;
    this.room = null;
    this.localStream = null;
    this.videoOverlay = null;
  }
}

export default PeerManager;