const STYLE_ID = 'video-overlay-styles';
const CONTAINER_ID = 'video-overlay';

function normalizeKey(value) {
  return String(value || '').trim();
}

function resolveAvatarUrl(characterKey) {
  const key = String(characterKey || '').trim().toLowerCase();
  if (key === 'adam') return '/assets/character/selection/Adam.png';
  if (key === 'ash') return '/assets/character/selection/Ash.png';
  if (key === 'lucy') return '/assets/character/selection/Lucy.png';
  if (key === 'nancy') return '/assets/character/selection/Nancy.png';
  return '';
}

function toInitials(name) {
  const normalized = String(name || '').trim();
  if (!normalized) {
    return '??';
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${CONTAINER_ID} {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 120000;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    #${CONTAINER_ID} .video-overlay-grid {
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: flex-end;
      gap: 12px;
      max-width: min(calc(100vw - 32px), 820px);
      pointer-events: none;
    }

    #${CONTAINER_ID} .local-video-anchor {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 160px;
      pointer-events: auto;
    }

    #${CONTAINER_ID} .video-tile {
      position: relative;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      color: #e5e7eb;
    }

    #${CONTAINER_ID} .video-frame {
      position: relative;
      overflow: hidden;
      border-radius: 14px;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.96));
      border: 1px solid rgba(148, 163, 184, 0.18);
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.4);
    }

    #${CONTAINER_ID} .video-frame.is-local {
      border-color: rgba(148, 163, 184, 0.35);
      box-shadow: 0 14px 28px rgba(0, 0, 0, 0.45);
    }

    #${CONTAINER_ID} .video-frame video {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #020617;
    }

    #${CONTAINER_ID} .video-frame.is-local video {
      transform: scaleX(-1);
    }

    #${CONTAINER_ID} .video-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      color: rgba(226, 232, 240, 0.75);
      font-size: 12px;
      letter-spacing: 0.01em;
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95));
    }

    #${CONTAINER_ID} .video-avatar {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95));
    }

    #${CONTAINER_ID} .video-avatar-image {
      width: 62px;
      height: 62px;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.32);
      image-rendering: pixelated;
      object-fit: cover;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.35);
      background: rgba(15, 23, 42, 0.85);
    }

    #${CONTAINER_ID} .video-avatar-initials {
      display: none;
      align-items: center;
      justify-content: center;
      width: 62px;
      height: 62px;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.32);
      font-size: 18px;
      color: #e2e8f0;
      background: rgba(15, 23, 42, 0.9);
    }

    #${CONTAINER_ID} .video-label {
      padding: 0 4px;
      font-size: 12px;
      line-height: 1.2;
      color: #f8fafc;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
      text-align: center;
    }

    #${CONTAINER_ID} .muted-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      display: none;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      background: rgba(185, 28, 28, 0.92);
      color: #fff1f2;
      font-size: 13px;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
    }

    #${CONTAINER_ID} .video-tile.is-muted .muted-badge {
      display: flex;
    }

    #${CONTAINER_ID} .local-controls {
      position: static;
      display: flex;
      flex-direction: row;
      justify-content: center;
      gap: 6px;
      align-items: center;
      pointer-events: auto;
      padding: 6px;
      border-radius: 12px;
      background: rgba(2, 6, 23, 0.45);
      backdrop-filter: blur(6px);
      margin-top: 6px;
    }

    #${CONTAINER_ID} .local-controls button {
      appearance: none;
      border: 0;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      font-size: 13px;
      color: #ffffff;
      background: rgba(15, 23, 42, 0.62);
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease, color 120ms ease, opacity 120ms ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    #${CONTAINER_ID} .local-controls button:hover:not(:disabled) {
      transform: translateY(-1px);
      background: rgba(30, 41, 59, 0.82);
      color: #fff;
    }

    #${CONTAINER_ID} .local-controls button.is-active {
      background: rgba(255, 255, 255, 0.22);
    }

    #${CONTAINER_ID} .local-controls button.is-muted {
      background: rgba(127, 29, 29, 0.94);
      color: #fee2e2;
    }

    #${CONTAINER_ID} .local-controls button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    #${CONTAINER_ID} .local-whiteboard-action {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-top: 6px;
      pointer-events: auto;
    }

    #${CONTAINER_ID} .meeting-whiteboard-button {
      width: 100%;
      min-height: 32px;
      padding: 6px 10px;
      border: 1px solid rgba(226, 232, 240, 0.75);
      border-radius: 10px;
      font-size: 12px;
      letter-spacing: 0.02em;
      background: #ffffff;
      color: #111827;
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease, color 120ms ease, opacity 120ms ease;
      white-space: normal;
      text-align: center;
      line-height: 1.15;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    #${CONTAINER_ID} .meeting-whiteboard-button:hover:not(:disabled) {
      background: #f8fafc;
      transform: translateY(-1px);
      color: #0f172a;
    }

    #${CONTAINER_ID} .meeting-whiteboard-button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);
}

function setVideoElementStream(video, stream) {
  if (!video) {
    return;
  }

  video.srcObject = stream || null;
  video.playsInline = true;
  video.autoplay = true;
  video.addEventListener(
    'loadedmetadata',
    () => {
      void video.play().catch(() => {
        // Autoplay can still fail on restrictive browsers.
      });
    },
    { once: true },
  );
}

function createMuteBadge() {
  const badge = document.createElement('div');
  badge.className = 'muted-badge';
  badge.textContent = 'Mic off';
  return badge;
}

function createLabel(text) {
  const label = document.createElement('div');
  label.className = 'video-label';
  label.textContent = text;
  return label;
}

export class VideoOverlay {
  constructor(mediaControls, options = {}) {
    this.mediaControls = mediaControls;
    this.options = options;
    this.container = null;
    this.grid = null;
    this.localAnchor = null;
    this.localControls = null;
    this.localTile = null;
    this.localLabel = null;
    this.localFrame = null;
    this.localPlaceholder = null;
    this.localAvatar = null;
    this.localAvatarImage = null;
    this.localAvatarInitials = null;
    this.localBadge = null;
    this.localVideo = null;
    this.remoteTiles = new Map();
    this.streamOwners = new Map();
    this.refreshTimer = null;
    this.muteButton = null;
    this.videoButton = null;
    this.meetingButton = null;
    this.profileBySessionId = new Map();
    this.remoteMediaStates = new Map();

    const localProfile = options?.localProfile || null;
    if (localProfile) {
      this.profileBySessionId.set('local', {
        name: String(localProfile.name || 'You'),
        avatarUrl: localProfile.avatarUrl || resolveAvatarUrl(localProfile.characterKey),
      });
    }

    this.ensureContainer();
    this.createLocalTile();
    this.refreshTimer = window.setInterval(() => this.refreshMuteIndicators(), 250);
  }

  ensureContainer() {
    ensureStyles();

    if (this.container) {
      return;
    }

    const container = document.createElement('div');
    container.id = CONTAINER_ID;

    const grid = document.createElement('div');
    grid.className = 'video-overlay-grid';

    const localAnchor = document.createElement('div');
    localAnchor.className = 'local-video-anchor';

    container.appendChild(grid);
    container.appendChild(localAnchor);
    document.body.appendChild(container);

    this.container = container;
    this.grid = grid;
    this.localAnchor = localAnchor;
  }

  createLocalTile() {
    if (this.localTile) {
      return;
    }

    const local = this.createTile('local', {
      width: 160,
      height: 120,
      isLocal: true,
    });

    const controls = document.createElement('div');
    controls.className = 'local-controls';

    const muteButton = document.createElement('button');
    muteButton.type = 'button';
    muteButton.title = 'Mute/Unmute';
    muteButton.addEventListener('click', () => {
      this.mediaControls.toggleMute();
      this.syncControlsState();
      this.refreshMuteIndicators();
      this.emitLocalMediaState();
    });

    const videoButton = document.createElement('button');
    videoButton.type = 'button';
    videoButton.title = 'Camera On/Off';
    videoButton.addEventListener('click', () => {
      this.mediaControls.toggleVideo();
      this.syncControlsState();
      this.refreshMuteIndicators();
      this.emitLocalMediaState();
    });

    const meetingAction = document.createElement('div');
    meetingAction.className = 'local-whiteboard-action';

    const meetingButton = document.createElement('button');
    meetingButton.type = 'button';
    meetingButton.className = 'meeting-whiteboard-button';
    meetingButton.textContent = 'Open Whiteboard';
    meetingButton.title = 'Open the meeting whiteboard';
    meetingButton.addEventListener('click', () => {
      this.options?.scene?.openMeetingWhiteboard?.();
    });

    controls.appendChild(muteButton);
    controls.appendChild(videoButton);
    meetingAction.appendChild(meetingButton);

    local.tile.appendChild(controls);
    local.tile.appendChild(meetingAction);
    local.tile.appendChild(local.label);
    this.localAnchor.appendChild(local.tile);

    this.localTile = local.tile;
    this.localLabel = local.label;
    this.localFrame = local.frame;
    this.localPlaceholder = local.placeholder;
    this.localAvatar = local.avatar;
    this.localAvatarImage = local.avatarImage;
    this.localAvatarInitials = local.avatarInitials;
    this.localBadge = local.badge;
    this.localVideo = local.video;
    this.localControls = controls;
    this.muteButton = muteButton;
    this.videoButton = videoButton;
    this.meetingButton = meetingButton;
    this.syncControlsState();
    this.syncMeetingWhiteboardButton();
  }

  syncControlsState() {
    if (!this.muteButton || !this.videoButton) {
      return;
    }

    const hasStream = Boolean(this.mediaControls?.getStream?.());
    const muted = this.mediaControls?.isMuted?.() ?? true;
    const videoOn = this.mediaControls?.isVideoOn?.() ?? false;

    this.muteButton.disabled = !hasStream;
    this.videoButton.disabled = !hasStream;

    this.muteButton.textContent = muted ? '🎤' : '🔊';
    this.videoButton.textContent = videoOn ? '📷' : '🚫';

    this.muteButton.classList.toggle('is-muted', muted);
    this.muteButton.classList.toggle('is-active', !muted);
    this.videoButton.classList.toggle('is-active', videoOn);
    this.videoButton.classList.toggle('is-muted', !videoOn);
  }

  syncMeetingWhiteboardButton() {
    if (!this.meetingButton) {
      return;
    }

    const scene = this.options?.scene;
    const boardId = String(scene?.room?.roomId || '').trim();
    const available = Boolean(scene?.meetingModeActive && boardId && typeof scene?.openMeetingWhiteboard === 'function');

    this.meetingButton.style.display = available ? 'inline-flex' : 'none';
    this.meetingButton.disabled = !available;
  }

  createTile(sessionId, { username = '', width = 160, height = 120, isLocal = false } = {}) {
    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.dataset.sessionId = sessionId;

    const frame = document.createElement('div');
    frame.className = `video-frame${isLocal ? ' is-local' : ''}`;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    if (isLocal) {
      video.muted = true;
    }

    const placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';
    placeholder.textContent = isLocal ? 'Camera off' : 'Connecting…';

    const avatar = document.createElement('div');
    avatar.className = 'video-avatar';

    const avatarImage = document.createElement('img');
    avatarImage.className = 'video-avatar-image';
    avatarImage.alt = `${isLocal ? 'You' : username || 'Guest'} avatar`;
    avatarImage.decoding = 'async';
    avatarImage.loading = 'lazy';

    const avatarInitials = document.createElement('div');
    avatarInitials.className = 'video-avatar-initials';
    avatarInitials.textContent = toInitials(isLocal ? 'You' : username || 'Guest');

    avatar.appendChild(avatarImage);
    avatar.appendChild(avatarInitials);

    const badge = createMuteBadge();
    const label = createLabel(isLocal ? 'You' : username || 'Guest');

    frame.appendChild(video);
    frame.appendChild(placeholder);
    frame.appendChild(avatar);
    frame.appendChild(badge);
    tile.appendChild(frame);

    if (!isLocal) {
      tile.appendChild(label);
    }

    return { tile, frame, video, placeholder, avatar, avatarImage, avatarInitials, badge, label };
  }

  isVideoTrackOn(stream) {
    if (!stream) {
      return false;
    }

    const tracks = stream.getVideoTracks?.() || [];
    if (tracks.length === 0) {
      return false;
    }

    return tracks.some((track) => track.enabled !== false && track.readyState === 'live');
  }

  updateAvatarForTile(sessionId, tile, username = '') {
    if (!tile) {
      return;
    }

    const key = normalizeKey(sessionId);
    const profile = this.profileBySessionId.get(key) || null;
    const name = String(profile?.name || username || (key === 'local' ? 'You' : 'Guest')).trim();
    const avatarUrl = String(profile?.avatarUrl || '').trim();

    tile.avatarInitials.textContent = toInitials(name);
    if (avatarUrl) {
      tile.avatarImage.src = avatarUrl;
      tile.avatarImage.style.display = 'block';
      tile.avatarInitials.style.display = 'none';
    } else {
      tile.avatarImage.removeAttribute('src');
      tile.avatarImage.style.display = 'none';
      tile.avatarInitials.style.display = 'flex';
    }
  }

  updateTileVisualState(sessionId, tile, stream, username = '') {
    const hasVideo = this.isVideoTrackOn(stream);
    const hasStream = Boolean(stream);
    const key = normalizeKey(sessionId);
    const remoteState = key !== 'local' ? this.remoteMediaStates.get(key) : null;
    const forceAvatar = key !== 'local' && remoteState?.videoEnabled === false;

    this.updateAvatarForTile(key, tile, username);
    tile.video.style.visibility = hasVideo && !forceAvatar ? 'visible' : 'hidden';
    tile.avatar.style.display = hasVideo && !forceAvatar ? 'none' : 'flex';
    tile.placeholder.style.display = hasStream && !hasVideo && !forceAvatar ? 'none' : hasStream ? 'none' : 'flex';
  }

  emitLocalMediaState() {
    const callback = this.options?.onMediaStateChange;
    if (typeof callback !== 'function') {
      return;
    }

    const payload = {
      videoEnabled: this.mediaControls?.isVideoOn?.() ?? false,
      audioEnabled: !(this.mediaControls?.isMuted?.() ?? true),
    };

    callback(payload);
  }

  setLocalStream(stream) {
    if (!this.localVideo) {
      return;
    }

    setVideoElementStream(this.localVideo, stream);
    this.localVideo.muted = true;
    this.updateTileVisualState('local', {
      video: this.localVideo,
      avatar: this.localAvatar,
      avatarImage: this.localAvatarImage,
      avatarInitials: this.localAvatarInitials,
      placeholder: this.localPlaceholder,
    }, stream, 'You');
    this.localBadge.style.display = stream && this.mediaControls?.isMuted?.() ? 'flex' : 'none';
    this.syncControlsState();
  }

  addStream(sessionId, stream, profile = {}) {
    const key = normalizeKey(sessionId);
    if (!key) {
      return;
    }

    const streamId = stream?.id ? String(stream.id) : null;
    const existingOwner = streamId ? this.streamOwners.get(streamId) : null;
    if (existingOwner && existingOwner !== key) {
      this.removeStream(existingOwner);
    }

    let tile = this.remoteTiles.get(key);
    if (!tile) {
      tile = this.createTile(key, { username: profile?.name || '', width: 160, height: 120, isLocal: false });
      this.remoteTiles.set(key, tile);
      this.grid.appendChild(tile.tile);
    }

    if (profile?.name) {
      tile.label.textContent = profile.name;
    }

    this.profileBySessionId.set(key, {
      name: String(profile?.name || tile.label.textContent || ''),
      avatarUrl: String(profile?.avatarUrl || resolveAvatarUrl(profile?.characterKey)),
    });

    if (!profile?.name && tile.label.textContent) {
      this.profileBySessionId.set(key, {
        name: tile.label.textContent,
        avatarUrl: String(profile?.avatarUrl || resolveAvatarUrl(profile?.characterKey)),
      });
    }

    setVideoElementStream(tile.video, stream);
    this.updateTileVisualState(key, tile, stream, profile?.name || tile.label.textContent);
    tile.badge.style.display = this.isStreamMuted(stream) ? 'flex' : 'none';

    if (streamId) {
      this.streamOwners.set(streamId, key);
    }
  }

  removeStream(sessionId) {
    const key = normalizeKey(sessionId);
    if (!key) {
      return;
    }

    const tile = this.remoteTiles.get(key);
    if (!tile) {
      return;
    }

    const streamId = tile.video?.srcObject?.id ? String(tile.video.srcObject.id) : null;
    if (streamId) {
      this.streamOwners.delete(streamId);
    }

    tile.video.srcObject = null;
    tile.tile.remove();
    this.remoteTiles.delete(key);
    this.profileBySessionId.delete(key);
    this.remoteMediaStates.delete(key);
  }

  replaceStreamKey(oldKey, newKey) {
    const from = normalizeKey(oldKey);
    const to = normalizeKey(newKey);
    if (!from || !to || from === to) {
      return;
    }

    const sourceTile = this.remoteTiles.get(from);
    if (!sourceTile) {
      return;
    }

    const targetTile = this.remoteTiles.get(to);
    if (targetTile) {
      this.removeStream(from);
      return;
    }

    sourceTile.tile.dataset.sessionId = to;
    this.remoteTiles.delete(from);
    this.remoteTiles.set(to, sourceTile);

    const profile = this.profileBySessionId.get(from);
    if (profile) {
      this.profileBySessionId.set(to, profile);
      this.profileBySessionId.delete(from);
    }

    const mediaState = this.remoteMediaStates.get(from);
    if (mediaState) {
      this.remoteMediaStates.set(to, mediaState);
      this.remoteMediaStates.delete(from);
    }

    const streamId = sourceTile.video?.srcObject?.id ? String(sourceTile.video.srcObject.id) : null;
    if (streamId) {
      this.streamOwners.set(streamId, to);
    }
  }

  updateProfile(sessionId, profile = {}) {
    const key = normalizeKey(sessionId);
    const tile = this.remoteTiles.get(key);
    const nextName = String(profile?.name || '').trim();
    const nextAvatar = String(profile?.avatarUrl || resolveAvatarUrl(profile?.characterKey)).trim();

    if (nextName || nextAvatar) {
      const existing = this.profileBySessionId.get(key) || {};
      this.profileBySessionId.set(key, {
        name: nextName || existing.name || '',
        avatarUrl: nextAvatar || existing.avatarUrl || '',
      });
    }

    if (tile && nextName) {
      tile.label.textContent = nextName;
      this.updateAvatarForTile(key, tile, nextName);
    }
  }

  updateUsername(sessionId, username) {
    this.updateProfile(sessionId, { name: username });
  }

  updateRemoteMediaState(sessionId, state = {}) {
    const key = normalizeKey(sessionId);
    if (!key || key === 'local') {
      return;
    }

    const previous = this.remoteMediaStates.get(key) || {};
    const next = {
      ...previous,
      ...(typeof state?.videoEnabled === 'boolean' ? { videoEnabled: state.videoEnabled } : {}),
      ...(typeof state?.audioEnabled === 'boolean' ? { audioEnabled: state.audioEnabled } : {}),
    };
    this.remoteMediaStates.set(key, next);

    const tile = this.remoteTiles.get(key);
    if (tile) {
      this.updateTileVisualState(
        key,
        tile,
        tile.video?.srcObject || null,
        tile.label?.textContent || 'Guest',
      );
    }
  }

  getVideoElement(sessionId) {
    const key = normalizeKey(sessionId);

    if (key === 'local') {
      return this.localVideo || null;
    }

    return this.remoteTiles.get(key)?.video || null;
  }

  isStreamMuted(stream) {
    if (!stream) {
      return true;
    }

    const audioTracks = stream.getAudioTracks?.() || [];
    if (audioTracks.length === 0) {
      return true;
    }

    return audioTracks.every((track) => track.enabled === false || track.muted === true);
  }

  refreshMuteIndicators() {
    if (this.localVideo) {
      const stream = this.mediaControls?.getStream?.();
      this.localBadge.style.display = this.isStreamMuted(stream) ? 'flex' : 'none';
      this.updateTileVisualState('local', {
        video: this.localVideo,
        avatar: this.localAvatar,
        avatarImage: this.localAvatarImage,
        avatarInitials: this.localAvatarInitials,
        placeholder: this.localPlaceholder,
      }, stream, this.profileBySessionId.get('local')?.name || 'You');
    }

    this.remoteTiles.forEach((tile) => {
      const streamId = tile.video?.srcObject?.id ? String(tile.video.srcObject.id) : null;
      const stream = tile.video?.srcObject || null;
      this.updateTileVisualState(tile.tile.dataset.sessionId || '', tile, stream, tile.label?.textContent || 'Guest');
      tile.badge.style.display = this.isStreamMuted(stream) ? 'flex' : 'none';
      if (streamId) {
        this.streamOwners.set(streamId, tile.tile.dataset.sessionId || '');
      }
    });

    this.syncControlsState();
  }

  destroy() {
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.remoteTiles.forEach((tile) => {
      const streamId = tile.video?.srcObject?.id ? String(tile.video.srcObject.id) : null;
      if (streamId) {
        this.streamOwners.delete(streamId);
      }
      tile.video.srcObject = null;
      tile.tile.remove();
    });
    this.remoteTiles.clear();
    this.streamOwners.clear();
    this.profileBySessionId.clear();
    this.remoteMediaStates.clear();

    if (this.localTile) {
      this.localVideo.srcObject = null;
      this.localTile.remove();
      this.localTile = null;
      this.localLabel = null;
      this.localFrame = null;
      this.localPlaceholder = null;
      this.localAvatar = null;
      this.localAvatarImage = null;
      this.localAvatarInitials = null;
      this.localBadge = null;
      this.localVideo = null;
    }

    this.localControls?.remove();
    this.localControls = null;
    this.muteButton = null;
    this.videoButton = null;
    this.meetingButton = null;

    this.container?.remove();
    this.container = null;
    this.grid = null;
    this.localAnchor = null;

    const style = document.getElementById(STYLE_ID);
    if (style) {
      style.remove();
    }
  }
}

export default VideoOverlay;