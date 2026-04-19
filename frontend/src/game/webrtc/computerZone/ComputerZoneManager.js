import { PeerMediaManager } from './PeerMediaManager';
import { ComputerZoneHUD } from './ComputerZoneHUD';

function sanitizePeerId(value) {
  return String(value || '')
    .trim()
    .replace(/[^0-9a-zA-Z-_]/g, '-');
}

function bool(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function readTrackEnabled(stream, kind, fallback) {
  if (!(stream instanceof MediaStream)) {
    return fallback;
  }

  const tracks = kind === 'video' ? stream.getVideoTracks() : stream.getAudioTracks();
  if (tracks.length === 0) {
    return false;
  }

  return tracks.some((track) => track.enabled !== false);
}

function stopStream(stream) {
  if (!(stream instanceof MediaStream)) {
    return;
  }

  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

function resolveAvatarUrl(characterKey) {
  const key = String(characterKey || '').trim().toLowerCase();
  if (key === 'adam') {
    return '/assets/character/selection/Adam.png';
  }

  if (key === 'ash') {
    return '/assets/character/selection/Ash.png';
  }

  if (key === 'lucy') {
    return '/assets/character/selection/Lucy.png';
  }

  if (key === 'nancy') {
    return '/assets/character/selection/Nancy.png';
  }

  return '';
}

export class ComputerZoneManager {
  constructor({ room, scene, proximityManager, mediaControls }) {
    this.room = room;
    this.scene = scene;
    this.proximityManager = proximityManager;
    this.mediaControls = mediaControls;

    this.hud = new ComputerZoneHUD();
    this.inZone = false;

    this.localSessionId = room?.sessionId || '';
    this.localPeerId = `cz-${sanitizePeerId(this.localSessionId)}`;

    this.peerManager = new PeerMediaManager(this.localPeerId);
    this.localStream = null;
    this.cameraStream = null;
    this.screenStream = null;
    this.shouldStopCameraStream = false;
    this.latestParticipants = {};
    this.remoteStreamsBySession = new Map();
    this.sessionByPeerId = new Map();

    this.boundStateHandler = (message) => this.handleComputerZoneState(message);
    this.room?.onMessage?.('computer-zone-state', this.boundStateHandler);

    this.peerManager.onStreamReceived = (peerId, stream) => {
      const sessionId = this.sessionByPeerId.get(peerId);
      if (!sessionId) {
        return;
      }

      this.remoteStreamsBySession.set(sessionId, stream);
      this.renderHUD();
    };

    this.peerManager.onPeerDisconnected = (peerId) => {
      const sessionId = this.sessionByPeerId.get(peerId);
      if (sessionId) {
        this.remoteStreamsBySession.delete(sessionId);
      }
      this.sessionByPeerId.delete(peerId);
      this.renderHUD();
    };

    this.hud.onToggleScreen = () => {
      void this.toggleScreenShare();
    };
    this.hud.onToggleVideo = () => this.toggleVideo();
    this.hud.onToggleAudio = () => this.toggleAudio();
    this.hud.onLeave = () => this.exitZone();
  }

  getPlayerName(sessionId) {
    const player = this.scene?.playersMap?.get?.(sessionId);
    if (!player) {
      return 'Guest';
    }

    const display = String(player?.username || player?.name || '').trim();
    return display || 'Guest';
  }

  getPlayerProfile(sessionId) {
    if (sessionId === this.localSessionId) {
      const local = this.scene?.playersMap?.get?.(sessionId) || {};
      const name = this.getPlayerName(sessionId);
      const avatarUrl = resolveAvatarUrl(local?.characterKey || local?.avatar || '');
      return { name, avatarUrl };
    }

    const player = this.scene?.playersMap?.get?.(sessionId) || {};
    return {
      name: this.getPlayerName(sessionId),
      avatarUrl: resolveAvatarUrl(player?.characterKey || player?.avatar || ''),
    };
  }

  isInZone() {
    return this.inZone;
  }

  getParticipants() {
    return this.latestParticipants;
  }

  getLocalMediaState() {
    return {
      isSharing: Boolean(this.screenStream),
      videoEnabled: readTrackEnabled(this.localStream, 'video', false),
      audioEnabled: readTrackEnabled(this.localStream, 'audio', false),
    };
  }

  getStreamForSession(sessionId) {
    if (sessionId === this.localSessionId) {
      return this.localStream;
    }

    return this.remoteStreamsBySession.get(sessionId) || null;
  }

  renderHUD() {
    if (!this.inZone) {
      return;
    }

    this.hud.updateParticipants(
      this.latestParticipants,
      this.localSessionId,
      (sessionId) => this.getStreamForSession(sessionId),
      (sessionId) => this.getPlayerProfile(sessionId),
    );
    this.hud.updateControlState(this.getLocalMediaState());
  }

  async ensureCameraStream() {
    if (this.cameraStream instanceof MediaStream) {
      return this.cameraStream;
    }

    const existing = this.mediaControls?.getStream?.();
    if (existing instanceof MediaStream) {
      this.cameraStream = existing;
      this.shouldStopCameraStream = false;
      this.applyPreferredMediaState(this.cameraStream);
      return this.cameraStream;
    }

    this.cameraStream = await this.peerManager.getCameraStream();
    this.mediaControls?.attachStream?.(this.cameraStream);
    this.shouldStopCameraStream = false;
    this.applyPreferredMediaState(this.cameraStream);
    return this.cameraStream;
  }

  applyPreferredMediaState(stream, options = {}) {
    if (!(stream instanceof MediaStream)) {
      return;
    }

    const applyVideo = options.applyVideo !== false;
    const applyAudio = options.applyAudio !== false;

    if (applyVideo) {
      const preferredVideoOn = this.mediaControls?.isVideoOn?.();
      if (typeof preferredVideoOn === 'boolean') {
        stream.getVideoTracks().forEach((track) => {
          track.enabled = preferredVideoOn;
        });
      }
    }

    if (applyAudio) {
      const preferredMuted = this.mediaControls?.isMuted?.();
      if (typeof preferredMuted === 'boolean') {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !preferredMuted;
        });
      }
    }
  }

  buildScreenCompositeStream(screenStream) {
    if (!(screenStream instanceof MediaStream)) {
      return new MediaStream();
    }

    const composite = new MediaStream();
    const screenVideoTracks = screenStream.getVideoTracks();
    screenVideoTracks.forEach((track) => composite.addTrack(track));

    const cameraAudioTracks = this.cameraStream?.getAudioTracks?.() || [];
    if (cameraAudioTracks.length === 0) {
      console.warn('[ComputerZoneManager] No camera audio track available for screen share');
    }
    cameraAudioTracks.forEach((track) => composite.addTrack(track));

    return composite;
  }

  async refreshPeerConnections() {
    if (!this.inZone) {
      return;
    }

    this.peerManager.disconnectAll();
    await this.callExistingParticipants();
  }

  async enterZone(computerId = 'default-computer') {
    if (this.inZone) {
      return;
    }

    try {
      await this.ensureCameraStream();
    } catch (error) {
      console.warn('[ComputerZoneManager] Camera/mic unavailable, joining without local AV', error);
      this.cameraStream = new MediaStream();
    }

    this.localStream = this.cameraStream;
    this.peerManager.listenForCalls(this.localStream);

    this.inZone = true;
    this.proximityManager?.pause?.(true);

    this.room?.send?.('computer-zone-join', {
      computerId,
      peerId: this.localPeerId,
      ...this.getLocalMediaState(),
    });

    this.hud.show();
    this.renderHUD();
  }

  async callExistingParticipants() {
    const tasks = [];

    Object.entries(this.latestParticipants).forEach(([sessionId, participant]) => {
      if (sessionId === this.localSessionId) {
        return;
      }

      const remotePeerId = participant?.peerId;
      if (!remotePeerId) {
        return;
      }

      this.sessionByPeerId.set(remotePeerId, sessionId);
      tasks.push(this.peerManager.callPeer(remotePeerId, this.localStream));
    });

    await Promise.allSettled(tasks);
  }

  exitZone() {
    if (!this.inZone) {
      return;
    }

    this.room?.send?.('computer-zone-leave', {});
    this.inZone = false;

    this.peerManager.disconnectAll();
    this.remoteStreamsBySession.clear();
    this.sessionByPeerId.clear();

    stopStream(this.screenStream);

    if (this.shouldStopCameraStream) {
      stopStream(this.cameraStream);
    }

    this.localStream = null;
    this.cameraStream = null;
    this.screenStream = null;
    this.shouldStopCameraStream = false;

    this.hud.hide();
    this.proximityManager?.resume?.();
  }

  async replaceVideoTrack(track) {
    await this.peerManager.replaceOutgoingVideoTrack(track || null);
  }

  async switchToCamera() {
    try {
      if (!(this.cameraStream instanceof MediaStream)) {
        await this.ensureCameraStream();
      }

      this.localStream = this.cameraStream;
      this.peerManager.setLocalStream(this.localStream);
      await this.refreshPeerConnections();
    } catch (error) {
      console.warn('[ComputerZoneManager] Failed to switch back to camera', error);
    }
  }

  async toggleScreenShare() {
    if (!this.inZone) {
      return;
    }

    if (this.screenStream instanceof MediaStream) {
      stopStream(this.screenStream);
      this.screenStream = null;
      await this.switchToCamera();
      this.room?.send?.('computer-zone-update', { isSharing: false });
      this.renderHUD();
      return;
    }

    try {
      const stream = await this.peerManager.getScreenStream();
      const screenTrack = stream?.getVideoTracks?.()[0] || null;
      if (!screenTrack) {
        return;
      }

      this.screenStream = stream;
      const composedStream = this.buildScreenCompositeStream(stream);
      this.localStream = composedStream;
      this.applyPreferredMediaState(this.localStream, { applyVideo: false, applyAudio: true });
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });
      this.peerManager.setLocalStream(this.localStream);
      console.log('[ComputerZoneManager] Screen-share tracks', this.localStream.getTracks());
      await this.refreshPeerConnections();

      screenTrack.onended = () => {
        if (!this.inZone) {
          return;
        }

        this.screenStream = null;
        void this.switchToCamera();
        this.room?.send?.('computer-zone-update', { isSharing: false });
        this.renderHUD();
      };

      this.room?.send?.('computer-zone-update', { isSharing: true });
      this.renderHUD();
    } catch (error) {
      console.warn('[ComputerZoneManager] Screen share denied/unavailable', error);
    }
  }

  toggleVideo() {
    if (!this.inZone || !(this.localStream instanceof MediaStream)) {
      return;
    }

    const tracks = this.localStream.getVideoTracks();
    if (tracks.length === 0) {
      return;
    }

    const next = !tracks.some((track) => track.enabled !== false);
    tracks.forEach((track) => {
      track.enabled = next;
    });

    this.room?.send?.('computer-zone-update', {
      videoEnabled: next,
      isSharing: Boolean(this.screenStream),
    });
    this.renderHUD();
  }

  toggleAudio() {
    if (!this.inZone || !(this.localStream instanceof MediaStream)) {
      return;
    }

    const tracks = this.localStream.getAudioTracks();
    if (tracks.length === 0) {
      return;
    }

    const next = !tracks.some((track) => track.enabled !== false);
    tracks.forEach((track) => {
      track.enabled = next;
    });

    this.room?.send?.('computer-zone-update', {
      audioEnabled: next,
      isSharing: Boolean(this.screenStream),
    });
    this.renderHUD();
  }

  handleComputerZoneState(message) {
    const payloadPlayers = message?.players;
    if (!payloadPlayers || typeof payloadPlayers !== 'object') {
      this.latestParticipants = {};
      this.renderHUD();
      return;
    }

    const nextParticipants = {};
    Object.entries(payloadPlayers).forEach(([sessionId, participant]) => {
      nextParticipants[sessionId] = {
        sessionId,
        peerId: String(participant?.peerId || ''),
        isSharing: bool(participant?.isSharing),
        videoEnabled: bool(participant?.videoEnabled),
        audioEnabled: bool(participant?.audioEnabled),
      };
    });

    const previousSessionIds = new Set(Object.keys(this.latestParticipants));
    const nextSessionIds = new Set(Object.keys(nextParticipants));
    const allowedPeerIds = new Set();

    previousSessionIds.forEach((sessionId) => {
      if (!nextSessionIds.has(sessionId)) {
        this.remoteStreamsBySession.delete(sessionId);
      }
    });

    Object.values(nextParticipants).forEach((participant) => {
      if (participant?.sessionId === this.localSessionId) {
        return;
      }

      const peerId = String(participant?.peerId || '').trim();
      if (peerId) {
        allowedPeerIds.add(peerId);
      }
    });

    this.latestParticipants = nextParticipants;

    if (!this.inZone) {
      return;
    }

    this.peerManager.disconnectPeersNotInSet(allowedPeerIds);

    void this.callExistingParticipants();
    this.renderHUD();
  }

  destroy() {
    this.exitZone();
    this.room = null;
    this.scene = null;
    this.proximityManager = null;

    this.peerManager?.destroy?.();
    this.peerManager = null;

    this.hud?.destroy?.();
    this.hud = null;
  }
}

export default ComputerZoneManager;
