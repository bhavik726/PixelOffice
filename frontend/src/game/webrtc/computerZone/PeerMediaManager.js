import Peer from 'peerjs';
import { ICE_SERVERS, PEER_CONFIG } from '../webrtcConfig';

function sanitizePeerId(value) {
  return String(value || '')
    .trim()
    .replace(/[^0-9a-zA-Z-_]/g, '-');
}

function getCallTrack(stream) {
  if (stream instanceof MediaStream) {
    return stream;
  }

  return new MediaStream();
}

export class PeerMediaManager {
  constructor(peerId) {
    this.peer = new Peer(sanitizePeerId(peerId), {
      ...PEER_CONFIG,
      config: { iceServers: ICE_SERVERS },
    });

    this.streams = new Map();
    this.connections = new Map();
    this.localStream = new MediaStream();

    this.onStreamReceived = () => {};
    this.onPeerDisconnected = () => {};

    this.peer.on('call', (call) => {
      const answerStream = getCallTrack(this.localStream);
      try {
        call.answer(answerStream);
      } catch (error) {
        console.warn('[PeerMediaManager] Failed to answer call', error);
        call.close();
        return;
      }

      this.attachCallHandlers(call);
    });

    this.peer.on('error', (error) => {
      console.warn('[PeerMediaManager] Peer error', error);
    });
  }

  getLocalPeerId() {
    return this.peer?.id || null;
  }

  setLocalStream(stream) {
    this.localStream = getCallTrack(stream);
  }

  hasConnection(remotePeerId) {
    return this.connections.has(remotePeerId);
  }

  getConnectedPeerIds() {
    return new Set(this.connections.keys());
  }

  attachCallHandlers(call) {
    if (!call?.peer) {
      return;
    }

    const remotePeerId = call.peer;
    this.connections.set(remotePeerId, call);

    call.on('stream', (stream) => {
      this.streams.set(remotePeerId, stream);
      this.onStreamReceived?.(remotePeerId, stream);
    });

    call.on('close', () => {
      this.streams.delete(remotePeerId);
      this.connections.delete(remotePeerId);
      this.onPeerDisconnected?.(remotePeerId);
    });

    call.on('error', (error) => {
      console.warn('[PeerMediaManager] Call error', { remotePeerId, error });
      this.streams.delete(remotePeerId);
      this.connections.delete(remotePeerId);
      this.onPeerDisconnected?.(remotePeerId);
    });
  }

  async callPeer(remotePeerId, localStream) {
    if (!remotePeerId || !this.peer) {
      return;
    }

    if (this.connections.has(remotePeerId)) {
      return;
    }

    const outboundStream = getCallTrack(localStream ?? this.localStream);
    const call = this.peer.call(remotePeerId, outboundStream);
    if (!call) {
      return;
    }

    this.attachCallHandlers(call);
  }

  listenForCalls(localStream) {
    this.setLocalStream(localStream);
  }

  async getScreenStream() {
    return await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
  }

  async getCameraStream() {
    return await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
  }

  async replaceOutgoingVideoTrack(nextVideoTrack) {
    const updates = [];

    this.connections.forEach((connection) => {
      const sender = connection.peerConnection
        ?.getSenders?.()
        ?.find((item) => item.track?.kind === 'video');

      if (sender) {
        updates.push(sender.replaceTrack(nextVideoTrack || null));
      }
    });

    await Promise.allSettled(updates);
  }

  disconnectPeer(remotePeerId) {
    const call = this.connections.get(remotePeerId);
    if (call) {
      call.close();
    }

    this.connections.delete(remotePeerId);
    this.streams.delete(remotePeerId);
    this.onPeerDisconnected?.(remotePeerId);
  }

  disconnectPeersNotInSet(allowedPeerIds) {
    const allowed = allowedPeerIds instanceof Set ? allowedPeerIds : new Set();

    this.connections.forEach((_, peerId) => {
      if (!allowed.has(peerId)) {
        this.disconnectPeer(peerId);
      }
    });
  }

  disconnectAll() {
    this.connections.forEach((call) => {
      call.close();
    });

    this.connections.clear();
    this.streams.clear();
  }

  destroy() {
    this.disconnectAll();
    try {
      this.peer?.destroy?.();
    } catch {
      // Ignore peer shutdown errors.
    }

    this.peer = null;
    this.localStream = null;
  }
}

export default PeerMediaManager;
