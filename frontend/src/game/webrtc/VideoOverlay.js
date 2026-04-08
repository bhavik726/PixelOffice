const STYLE_ID = 'video-overlay-styles';
const CONTAINER_ID = 'video-overlay';

function normalizeKey(value) {
  return String(value || '').trim();
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
  constructor(mediaControls) {
    this.mediaControls = mediaControls;
    this.container = null;
    this.grid = null;
    this.localAnchor = null;
    this.localControls = null;
    this.localTile = null;
    this.localLabel = null;
    this.localFrame = null;
    this.localPlaceholder = null;
    this.localBadge = null;
    this.localVideo = null;
    this.remoteTiles = new Map();
    this.streamOwners = new Map();
    this.refreshTimer = null;
    this.muteButton = null;
    this.videoButton = null;

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
    });

    const videoButton = document.createElement('button');
    videoButton.type = 'button';
    videoButton.title = 'Camera On/Off';
    videoButton.addEventListener('click', () => {
      this.mediaControls.toggleVideo();
      this.syncControlsState();
    });

    controls.appendChild(muteButton);
    controls.appendChild(videoButton);

    local.tile.appendChild(controls);
    local.tile.appendChild(local.label);
    this.localAnchor.appendChild(local.tile);

    this.localTile = local.tile;
    this.localLabel = local.label;
    this.localFrame = local.frame;
    this.localPlaceholder = local.placeholder;
    this.localBadge = local.badge;
    this.localVideo = local.video;
    this.localControls = controls;
    this.muteButton = muteButton;
    this.videoButton = videoButton;
    this.syncControlsState();
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

    const badge = createMuteBadge();
    const label = createLabel(isLocal ? 'You' : username || 'Guest');

    frame.appendChild(video);
    frame.appendChild(placeholder);
    frame.appendChild(badge);
    tile.appendChild(frame);

    if (!isLocal) {
      tile.appendChild(label);
    }

    return { tile, frame, video, placeholder, badge, label };
  }

  setLocalStream(stream) {
    if (!this.localVideo) {
      return;
    }

    setVideoElementStream(this.localVideo, stream);
    this.localVideo.muted = true;
    this.localPlaceholder.style.display = stream ? 'none' : 'flex';
    this.localBadge.style.display = stream && this.mediaControls?.isMuted?.() ? 'flex' : 'none';
    this.syncControlsState();
  }

  addStream(sessionId, stream, username = '') {
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
      tile = this.createTile(key, { username, width: 160, height: 120, isLocal: false });
      this.remoteTiles.set(key, tile);
      this.grid.appendChild(tile.tile);
    }

    if (username) {
      tile.label.textContent = username;
    }

    setVideoElementStream(tile.video, stream);
    tile.placeholder.style.display = stream ? 'none' : 'flex';
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

    const streamId = sourceTile.video?.srcObject?.id ? String(sourceTile.video.srcObject.id) : null;
    if (streamId) {
      this.streamOwners.set(streamId, to);
    }
  }

  updateUsername(sessionId, username) {
    const key = normalizeKey(sessionId);
    const tile = this.remoteTiles.get(key);
    if (tile && username) {
      tile.label.textContent = username;
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
    }

    this.remoteTiles.forEach((tile) => {
      const streamId = tile.video?.srcObject?.id ? String(tile.video.srcObject.id) : null;
      const stream = tile.video?.srcObject || null;
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

    if (this.localTile) {
      this.localVideo.srcObject = null;
      this.localTile.remove();
      this.localTile = null;
      this.localLabel = null;
      this.localFrame = null;
      this.localPlaceholder = null;
      this.localBadge = null;
      this.localVideo = null;
    }

    this.localControls?.remove();
    this.localControls = null;
    this.muteButton = null;
    this.videoButton = null;

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