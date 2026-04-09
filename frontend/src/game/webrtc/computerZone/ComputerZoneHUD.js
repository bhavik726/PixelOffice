const STYLE_ID = 'computer-zone-hud-style';
const ROOT_ID = 'computer-zone-hud';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 140000;
      pointer-events: none;
      font-family: 'VT323', 'Courier New', monospace;
      color: #f8fafc;
      opacity: 0;
      transform: scale(0.985);
      transition: opacity 180ms ease, transform 180ms ease;
    }

    #${ROOT_ID}.is-visible {
      opacity: 1;
      transform: scale(1);
    }

    #${ROOT_ID} .cz-shell {
      position: absolute;
      inset: 20px;
      border: 1px solid rgba(34, 211, 238, 0.35);
      border-radius: 16px;
      overflow: hidden;
      background:
        radial-gradient(1200px 500px at -10% 120%, rgba(2, 132, 199, 0.26), transparent 70%),
        radial-gradient(900px 400px at 110% -20%, rgba(16, 185, 129, 0.22), transparent 72%),
        linear-gradient(180deg, rgba(2, 6, 23, 0.86), rgba(2, 6, 23, 0.92));
      backdrop-filter: blur(12px);
      pointer-events: auto;
      display: grid;
      grid-template-rows: 1fr auto;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
    }

    #${ROOT_ID}:not(.is-visible) .cz-shell {
      pointer-events: none;
    }

    #${ROOT_ID} .cz-grid {
      padding: 14px;
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(1, minmax(0, 1fr));
      align-content: start;
      overflow: auto;
    }

    #${ROOT_ID}[data-has-share='true'] .cz-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-content: stretch;
    }

    #${ROOT_ID}[data-layout='two'] .cz-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    #${ROOT_ID}[data-layout='quad'] .cz-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    #${ROOT_ID}[data-layout='many'] .cz-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    #${ROOT_ID} .cz-tile {
      position: relative;
      min-height: 160px;
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 12px;
      overflow: hidden;
    }

    #${ROOT_ID} .cz-tile.is-stage {
      grid-column: 1 / -1;
      min-height: min(58vh, 520px);
      border-color: rgba(34, 211, 238, 0.5);
      box-shadow: 0 0 0 1px rgba(6, 182, 212, 0.22), 0 20px 42px rgba(0, 0, 0, 0.45);
    }

    #${ROOT_ID} .cz-tile.is-stage .cz-video {
      object-fit: contain;
      background: #020617;
    }

    #${ROOT_ID} .cz-video {
      width: 100%;
      height: 100%;
      min-height: 160px;
      display: block;
      object-fit: cover;
      background: #020617;
    }

    #${ROOT_ID} .cz-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      letter-spacing: 0.02em;
      color: rgba(226, 232, 240, 0.88);
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.9));
    }

    #${ROOT_ID} .cz-avatar {
      position: absolute;
      inset: 0;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(30, 41, 59, 0.88));
    }

    #${ROOT_ID} .cz-avatar-image {
      width: 84px;
      height: 84px;
      border-radius: 14px;
      border: 1px solid rgba(148, 163, 184, 0.34);
      image-rendering: pixelated;
      object-fit: cover;
      background: rgba(15, 23, 42, 0.85);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
    }

    #${ROOT_ID} .cz-avatar-initials {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 84px;
      height: 84px;
      border-radius: 14px;
      border: 1px solid rgba(148, 163, 184, 0.34);
      font-size: 26px;
      background: rgba(15, 23, 42, 0.9);
      color: #e2e8f0;
    }

    #${ROOT_ID} .cz-label {
      position: absolute;
      left: 8px;
      bottom: 8px;
      padding: 5px 8px;
      border-radius: 8px;
      background: rgba(2, 6, 23, 0.72);
      border: 1px solid rgba(148, 163, 184, 0.26);
      font-size: 18px;
      line-height: 1;
    }

    #${ROOT_ID} .cz-status {
      position: absolute;
      right: 8px;
      bottom: 8px;
      display: inline-flex;
      gap: 6px;
      font-size: 14px;
    }

    #${ROOT_ID} .cz-pill {
      padding: 3px 6px;
      border-radius: 999px;
      border: 1px solid rgba(51, 65, 85, 0.7);
      background: rgba(15, 23, 42, 0.78);
      color: #cbd5e1;
    }

    #${ROOT_ID} .cz-pill.is-on {
      border-color: rgba(34, 211, 238, 0.65);
      color: #cffafe;
      background: rgba(8, 145, 178, 0.3);
      box-shadow: 0 0 14px rgba(6, 182, 212, 0.22);
    }

    #${ROOT_ID} .cz-controls {
      padding: 10px 14px 12px;
      display: flex;
      gap: 10px;
      justify-content: center;
      border-top: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(2, 6, 23, 0.75);
    }

    #${ROOT_ID} .cz-controls button {
      border: 1px solid rgba(100, 116, 139, 0.45);
      background: rgba(15, 23, 42, 0.78);
      color: #e2e8f0;
      border-radius: 9px;
      min-width: 96px;
      height: 34px;
      position: relative;
      overflow: hidden;
      font-family: inherit;
      letter-spacing: 0.02em;
      font-size: 16px;
      cursor: pointer;
      transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
    }

    #${ROOT_ID} .cz-controls button:hover {
      transform: translateY(-1px);
      background: rgba(30, 41, 59, 0.88);
      border-color: rgba(148, 163, 184, 0.62);
    }

    #${ROOT_ID} .cz-controls button.is-active {
      border-color: rgba(34, 211, 238, 0.72);
      color: #cffafe;
      background: rgba(8, 145, 178, 0.3);
      box-shadow: 0 0 14px rgba(6, 182, 212, 0.24);
    }

    #${ROOT_ID} .cz-controls button.is-off {
      border-color: rgba(248, 113, 113, 0.62);
      color: #fecaca;
      background: rgba(127, 29, 29, 0.68);
    }

    #${ROOT_ID} .cz-controls button.is-off::after {
      content: '';
      position: absolute;
      left: 7px;
      right: 7px;
      top: 50%;
      height: 2px;
      border-radius: 999px;
      transform: rotate(-16deg);
      background: rgba(254, 202, 202, 0.95);
      box-shadow: 0 0 8px rgba(248, 113, 113, 0.5);
      pointer-events: none;
    }

    #${ROOT_ID} .cz-controls button.is-leave {
      border-color: rgba(248, 113, 113, 0.62);
      color: #fecaca;
      background: rgba(127, 29, 29, 0.75);
    }

    @media (max-width: 900px) {
      #${ROOT_ID} .cz-shell {
        inset: 10px;
      }

      #${ROOT_ID}[data-layout='many'] .cz-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      #${ROOT_ID} .cz-controls {
        flex-wrap: wrap;
      }

      #${ROOT_ID}[data-has-share='true'] .cz-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      #${ROOT_ID} .cz-tile.is-stage {
        min-height: min(46vh, 420px);
      }
    }
  `;

  document.head.appendChild(style);
}

function setVideo(video, stream) {
  video.srcObject = stream || null;
  if (stream) {
    video
      .play()
      .catch(() => {
        // Ignore autoplay failures in restricted environments.
      });
  }
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

export class ComputerZoneHUD {
  constructor() {
    this.root = null;
    this.grid = null;
    this.controls = null;
    this.tiles = new Map();

    this.onToggleScreen = () => {};
    this.onToggleVideo = () => {};
    this.onToggleAudio = () => {};
    this.onLeave = () => {};

    this.buttons = {
      screen: null,
      video: null,
      audio: null,
      leave: null,
    };

    this.ensureRoot();
  }

  ensureRoot() {
    ensureStyles();

    if (this.root) {
      return;
    }

    const root = document.createElement('div');
    root.id = ROOT_ID;

    const shell = document.createElement('div');
    shell.className = 'cz-shell';

    const grid = document.createElement('div');
    grid.className = 'cz-grid';

    const controls = document.createElement('div');
    controls.className = 'cz-controls';

    const screenBtn = document.createElement('button');
    screenBtn.type = 'button';
    screenBtn.textContent = 'Screen';
    screenBtn.addEventListener('click', () => this.onToggleScreen?.());

    const videoBtn = document.createElement('button');
    videoBtn.type = 'button';
    videoBtn.textContent = 'Camera';
    videoBtn.addEventListener('click', () => this.onToggleVideo?.());

    const audioBtn = document.createElement('button');
    audioBtn.type = 'button';
    audioBtn.textContent = 'Mic';
    audioBtn.addEventListener('click', () => this.onToggleAudio?.());

    const leaveBtn = document.createElement('button');
    leaveBtn.type = 'button';
    leaveBtn.className = 'is-leave';
    leaveBtn.textContent = 'Leave';
    leaveBtn.addEventListener('click', () => this.onLeave?.());

    controls.appendChild(screenBtn);
    controls.appendChild(videoBtn);
    controls.appendChild(audioBtn);
    controls.appendChild(leaveBtn);

    shell.appendChild(grid);
    shell.appendChild(controls);
    root.appendChild(shell);

    document.body.appendChild(root);

    this.root = root;
    this.grid = grid;
    this.controls = controls;
    this.buttons = {
      screen: screenBtn,
      video: videoBtn,
      audio: audioBtn,
      leave: leaveBtn,
    };

    this.hide();
  }

  show() {
    this.ensureRoot();
    if (this.root) {
      this.root.style.display = 'block';
    }
    this.root?.classList.add('is-visible');
  }

  hide() {
    this.root?.classList.remove('is-visible');
    if (this.root) {
      this.root.style.display = 'none';
    }
  }

  updateControlState({ isSharing, videoEnabled, audioEnabled }) {
    this.buttons.screen?.classList.toggle('is-active', Boolean(isSharing));
    this.buttons.video?.classList.toggle('is-active', Boolean(videoEnabled));
    this.buttons.audio?.classList.toggle('is-active', Boolean(audioEnabled));

    this.buttons.video?.classList.toggle('is-off', !videoEnabled);
    this.buttons.audio?.classList.toggle('is-off', !audioEnabled);
  }

  getLayout(count) {
    if (count <= 1) {
      return 'single';
    }

    if (count === 2) {
      return 'two';
    }

    if (count <= 4) {
      return 'quad';
    }

    return 'many';
  }

  ensureTile(sessionId, label) {
    const key = String(sessionId);
    let tile = this.tiles.get(key);
    if (tile) {
      tile.label.textContent = label || tile.label.textContent;
      return tile;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'cz-tile';

    const video = document.createElement('video');
    video.className = 'cz-video';
    video.autoplay = true;
    video.playsInline = true;

    const placeholder = document.createElement('div');
    placeholder.className = 'cz-placeholder';
    placeholder.textContent = 'No video';

    const avatar = document.createElement('div');
    avatar.className = 'cz-avatar';

    const avatarImage = document.createElement('img');
    avatarImage.className = 'cz-avatar-image';
    avatarImage.alt = `${label || 'Guest'} avatar`;
    avatarImage.decoding = 'async';
    avatarImage.loading = 'lazy';

    const avatarInitials = document.createElement('div');
    avatarInitials.className = 'cz-avatar-initials';
    avatarInitials.textContent = toInitials(label);

    avatar.appendChild(avatarImage);
    avatar.appendChild(avatarInitials);

    const labelEl = document.createElement('div');
    labelEl.className = 'cz-label';
    labelEl.textContent = label || 'Guest';

    const status = document.createElement('div');
    status.className = 'cz-status';

    const screen = document.createElement('span');
    screen.className = 'cz-pill';
    screen.textContent = 'SCR';

    const cam = document.createElement('span');
    cam.className = 'cz-pill';
    cam.textContent = 'CAM';

    const mic = document.createElement('span');
    mic.className = 'cz-pill';
    mic.textContent = 'MIC';

    status.appendChild(screen);
    status.appendChild(cam);
    status.appendChild(mic);

    wrapper.appendChild(video);
    wrapper.appendChild(placeholder);
    wrapper.appendChild(avatar);
    wrapper.appendChild(labelEl);
    wrapper.appendChild(status);

    this.grid?.appendChild(wrapper);

    tile = {
      wrapper,
      video,
      placeholder,
      avatar,
      avatarImage,
      avatarInitials,
      label: labelEl,
      status: { screen, cam, mic },
    };
    this.tiles.set(key, tile);
    return tile;
  }

  updateParticipants(participants, localSessionId, streamResolver, profileResolver) {
    const ids = new Set(Object.keys(participants || {}));

    this.tiles.forEach((tile, sessionId) => {
      if (!ids.has(sessionId)) {
        tile.video.srcObject = null;
        tile.wrapper.remove();
        this.tiles.delete(sessionId);
      }
    });

    const keys = Object.keys(participants || {});
    const sharingSessionId = keys.find((sessionId) => {
      const participant = participants[sessionId];
      return Boolean(participant?.isSharing) && Boolean(streamResolver?.(sessionId));
    }) || null;

    keys.forEach((sessionId) => {
      const participant = participants[sessionId];
      const profile = profileResolver?.(sessionId) || {};
      const label =
        sessionId === localSessionId
          ? 'You'
          : profile?.name || `Player ${sessionId.slice(0, 4)}`;

      const tile = this.ensureTile(sessionId, label);
      const stream = streamResolver?.(sessionId) || null;
      const isStage = sharingSessionId === sessionId;
      const useAvatarCard = !isStage && (!stream || !participant?.videoEnabled || !participant?.audioEnabled);

      tile.wrapper.classList.toggle('is-stage', isStage);
      setVideo(tile.video, stream);
      tile.video.muted = sessionId === localSessionId;
      tile.video.style.visibility = useAvatarCard ? 'hidden' : 'visible';
      tile.placeholder.style.display = !stream && !useAvatarCard ? 'flex' : 'none';

      tile.avatar.style.display = useAvatarCard ? 'flex' : 'none';
      tile.avatarInitials.textContent = toInitials(label);
      if (profile?.avatarUrl) {
        tile.avatarImage.src = profile.avatarUrl;
        tile.avatarImage.style.display = 'block';
        tile.avatarInitials.style.display = 'none';
      } else {
        tile.avatarImage.removeAttribute('src');
        tile.avatarImage.style.display = 'none';
        tile.avatarInitials.style.display = 'flex';
      }

      tile.status.screen.classList.toggle('is-on', Boolean(participant?.isSharing));
      tile.status.cam.classList.toggle('is-on', Boolean(participant?.videoEnabled));
      tile.status.mic.classList.toggle('is-on', Boolean(participant?.audioEnabled));
    });

    if (this.root) {
      this.root.dataset.layout = this.getLayout(keys.length);
      this.root.dataset.hasShare = sharingSessionId ? 'true' : 'false';
    }
  }

  destroy() {
    this.tiles.forEach((tile) => {
      tile.video.srcObject = null;
      tile.wrapper.remove();
    });
    this.tiles.clear();

    this.root?.remove();
    this.root = null;
    this.grid = null;
    this.controls = null;
    this.buttons = {
      screen: null,
      video: null,
      audio: null,
      leave: null,
    };

    const style = document.getElementById(STYLE_ID);
    if (style) {
      style.remove();
    }
  }
}

export default ComputerZoneHUD;
