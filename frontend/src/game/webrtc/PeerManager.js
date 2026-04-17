import Peer from 'peerjs';
import { ICE_SERVERS, PEER_CONFIG } from './webrtcConfig';

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
    this.connectionState = new Map();
    this.messageHandler = (message) => this.handlePeerIdMessage(message);
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
      await Promise.allSettled(updates);
    }
  }

  getDisplayKey(sessionId, peerId) {
    if (sessionId && this.sessionPeerIds.has(sessionId)) {
      return sessionId;
    }

    return sessionId || peerId;
  }

  getProfile(sessionId) {
    const player = this.room?.state?.players?.get?.(sessionId);
    return {
      name: player?.username || player?.name || '',
      characterKey: player?.characterKey || '',
    };
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

    const peer = await new Promise((resolve, reject) => {
      const nextPeer = new Peer(this.localPeerId, {
        ...PEER_CONFIG,
        config: { iceServers: ICE_SERVERS },
      });

      const onOpen = (peerId) => {
        cleanup();
        this.localPeerId = sanitizePeerId(peerId);
        console.log('✅ Peer connected:', this.localPeerId);
        this.broadcastLocalPeerId();
        resolve(nextPeer);
      };

      const onError = (error) => {
        cleanup();
        console.error('❌ Peer error:', error);
        reject(error);
      };

      const cleanup = () => {
        nextPeer.off('open', onOpen);
        nextPeer.off('error', onError);
      };

      nextPeer.on('open', onOpen);
      nextPeer.on('error', onError);
      nextPeer.on('call', (call) => this.handleIncomingCall(call));
      nextPeer.on('disconnected', () => {
        console.warn('⚠️ Peer disconnected');
      });
    });

    this.peer = peer;
    this.initialized = true;
    this.room?.onMessage?.('peer-id', this.messageHandler);

    return this.peer;
  }

  broadcastLocalPeerId() {
    if (!this.room || !this.localPeerId) {
      return;
    }

    try {
      this.room.send('peer-id', { peerId: this.localPeerId });
    } catch (error) {
      console.error('[PeerManager] Failed to broadcast local peer id', error);
    }
  }

  handlePeerIdMessage(message) {
    if (this.destroyed || !message || typeof message !== 'object') {
      return;
    }

    const { sessionId, peerId } = message;
    if (typeof sessionId !== 'string' || typeof peerId !== 'string') {
      return;
    }

    const sanitizedPeerId = sanitizePeerId(peerId);
    this.sessionPeerIds.set(sessionId, sanitizedPeerId);
    this.peerIdToSessionId.set(sanitizedPeerId, sessionId);
    this.videoOverlay?.replaceStreamKey?.(sanitizedPeerId, sessionId);
    this.videoOverlay?.updateProfile?.(sessionId, this.getProfile(sessionId));
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

  connectToPeer(sessionId) {
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
      return null;
    }

    if (this.outgoingCalls.has(peerId) || this.incomingCalls.has(peerId)) {
      return this.outgoingCalls.get(peerId) || this.incomingCalls.get(peerId) || null;
    }

    const outboundStream = this.getOutboundStream();
    if (!outboundStream || outboundStream.getTracks().length === 0) {
      console.warn('No media stream available');
      return null;
    }

    console.log('📞 Attempting call to:', peerId);
    const call = this.peer.call(peerId, outboundStream);
    if (!call) {
      return null;
    }

    this.connectionState.set(peerId, 'connecting');
    const record = { call, stream: null, sessionId, peerId };
    this.outgoingCalls.set(peerId, record);

    call.on('stream', (stream) => {
      record.stream = stream;
      this.connectionState.set(peerId, 'connected');
      this.upsertRemoteStream(peerId, stream, sessionId);
    });

    call.on('close', () => {
      this.connectionState.set(peerId, 'idle');
      this.removeRemoteStream(peerId);
      this.outgoingCalls.delete(peerId);
    });

    call.on('error', (error) => {
      console.warn('Outgoing PeerJS call error', { sessionId, error });
      this.connectionState.set(peerId, 'idle');
      this.outgoingCalls.delete(peerId);
      this.removeRemoteStream(peerId);
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

    const answerStream = this.getOutboundStream();
    const sessionId = this.peerIdToSessionId.get(peerId) || call.metadata?.fromSessionId || peerId;
    const record = { call, stream: null, sessionId, peerId };
    this.incomingCalls.set(peerId, record);
    this.connectionState.set(peerId, 'connecting');

    try {
      call.answer(answerStream);
    } catch (error) {
      console.warn('Failed to answer incoming PeerJS call', { peerId, error });
      this.connectionState.set(peerId, 'idle');
      this.incomingCalls.delete(peerId);
      call.close();
      return;
    }

    call.on('stream', (stream) => {
      record.stream = stream;
      this.connectionState.set(peerId, 'connected');
      this.upsertRemoteStream(peerId, stream, sessionId);
    });

    call.on('close', () => {
      this.connectionState.set(peerId, 'idle');
      this.removeRemoteStream(peerId);
      this.incomingCalls.delete(peerId);
    });

    call.on('error', (error) => {
      console.warn('Incoming PeerJS call error', { peerId, error });
      this.connectionState.set(peerId, 'idle');
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

    this.connectionState.delete(peerId);
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
    this.connectionState.clear();

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
  }
}

export default PeerManager;
