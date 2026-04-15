import { PROXIMITY_POLL_INTERVAL, PROXIMITY_RADIUS } from './webrtcConfig';

function getDistance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function clampVolume(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothFalloff(distance, radius) {
  if (radius <= 0) {
    return 0;
  }

  const t = clampVolume(distance / radius);
  const smoothStep = t * t * (3 - 2 * t);
  return clampVolume(1 - smoothStep);
}

function readLayerIntProperty(layer, name) {
  const property = layer?.properties?.find?.((item) => item?.name === name);
  const value = Number(property?.value);
  return Number.isFinite(value) ? value : null;
}

const MEETING_TOAST_STYLE_ID = 'meeting-mode-toast-style';

function ensureMeetingToastStyles() {
  if (document.getElementById(MEETING_TOAST_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = MEETING_TOAST_STYLE_ID;
  style.textContent = `
    .meeting-mode-toast {
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translate(-50%, -14px);
      z-index: 130000;
      pointer-events: none;
      opacity: 0;
      transition: opacity 220ms ease, transform 220ms ease;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid rgba(16, 185, 129, 0.55);
      background: linear-gradient(135deg, rgba(5, 46, 22, 0.95), rgba(6, 78, 59, 0.92));
      color: #ecfdf5;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(8px);
    }

    .meeting-mode-toast.is-visible {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  `;

  document.head.appendChild(style);
}

export class ProximityManager {
  constructor(scene, peerManager) {
    this.scene = scene;
    this.peerManager = peerManager;
    this.intervalId = null;
    this.running = false;
    this.paused = false;
    this.meetingBounds = this.resolveMeetingBounds();
    this.localInMeeting = null;
    this.toastElement = null;
    this.toastHideTimer = null;
  }

  ensureMeetingToast() {
    if (this.toastElement) {
      return;
    }

    ensureMeetingToastStyles();
    const toast = document.createElement('div');
    toast.className = 'meeting-mode-toast';
    document.body.appendChild(toast);
    this.toastElement = toast;
  }

  showMeetingToast(text) {
    this.ensureMeetingToast();
    if (!this.toastElement) {
      return;
    }

    this.toastElement.textContent = text;
    this.toastElement.classList.add('is-visible');

    if (this.toastHideTimer) {
      window.clearTimeout(this.toastHideTimer);
    }

    this.toastHideTimer = window.setTimeout(() => {
      this.toastElement?.classList.remove('is-visible');
      this.toastHideTimer = null;
    }, 1800);
  }

  updateMeetingStatus(localInMeeting) {
    if (this.localInMeeting === localInMeeting) {
      return;
    }

    this.scene.meetingModeActive = localInMeeting;
    this.scene.updateMeetingUi?.();

    if (this.localInMeeting !== null) {
      this.showMeetingToast(localInMeeting ? 'Entered Meeting Mode' : 'Exited Meeting Mode');
    }

    this.localInMeeting = localInMeeting;
  }

  resolveMeetingBounds() {
    const tileWidth = Number(this.scene?.tilemap?.tileWidth) || 32;
    const tileHeight = Number(this.scene?.tilemap?.tileHeight) || 32;
    const meetingLayer = this.scene?.tilemap?.getObjectLayer?.('meeting');

    const xTop = readLayerIntProperty(meetingLayer, 'xtop');
    const yTop = readLayerIntProperty(meetingLayer, 'ytop');
    const xBottom = readLayerIntProperty(meetingLayer, 'xbottom');
    const yBottom = readLayerIntProperty(meetingLayer, 'ybottom');

    if (
      xTop === null ||
      yTop === null ||
      xBottom === null ||
      yBottom === null
    ) {
      return null;
    }

    return {
      left: xTop * tileWidth,
      top: yTop * tileHeight,
      right: (xBottom + 1) * tileWidth,
      bottom: (yBottom + 1) * tileHeight,
    };
  }

  isInsideMeeting(x, y) {
    const bounds = this.meetingBounds;
    if (!bounds) {
      return false;
    }

    return x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom;
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.intervalId = window.setInterval(() => this.tick(), PROXIMITY_POLL_INTERVAL);
    this.tick();
  }

  tick() {
    if (this.paused) {
      const inComputerZone = this.scene?.computerZoneManager?.isInZone?.() === true;
      if (!inComputerZone) {
        this.paused = false;
      }
    }

    if (this.paused) {
      return;
    }

    const localSprite = this.scene?.player?.sprite;
    if (!localSprite || !this.peerManager) {
      // Silent return on first few ticks - scene might not be fully initialized
      if (this.tickCount === undefined) {
        this.tickCount = 0;
      }
      this.tickCount++;
      if (this.tickCount === 4) {
        console.warn('[ProximityManager:tick] Missing localSprite or peerManager after multiple ticks', {
          hasSprite: !!localSprite,
          hasPeerManager: !!this.peerManager,
          playerExists: !!this.scene?.player,
        });
      }
      return;
    }

    // Reset tick counter once initialized
    this.tickCount = 0;

    const localX = Number(localSprite.x);
    const localY = Number(localSprite.y);
    if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
      console.warn('[ProximityManager:tick] Invalid sprite coordinates', { localX, localY });
      return;
    }

    const localSessionId = this.scene?.room?.sessionId;
    if (!localSessionId) {
      console.warn('[ProximityManager:tick] No local session ID');
      return;
    }

    const localInMeeting = this.isInsideMeeting(localX, localY);
    this.updateMeetingStatus(localInMeeting);

    const computerParticipants = this.scene?.computerZoneManager?.getParticipants?.() || {};
    const localInComputerZone = this.scene?.computerZoneManager?.isInZone?.() === true;

    const seenSessions = new Set();

    this.scene.playersMap.forEach((player, sessionId) => {
      if (sessionId === localSessionId) {
        return;
      }

      seenSessions.add(sessionId);

      const remoteX = Number(player?.x);
      const remoteY = Number(player?.y);
      const displayName = String(player?.username || player?.name || '').trim();
      this.peerManager.videoOverlay?.updateProfile?.(sessionId, {
        name: displayName,
        characterKey: String(player?.characterKey || '').trim().toLowerCase(),
      });

      if (!Number.isFinite(remoteX) || !Number.isFinite(remoteY)) {
        console.warn('[ProximityManager:tick] Invalid remote coordinates', { sessionId: sessionId.slice(0, 8), remoteX, remoteY });
        return;
      }

      const distance = getDistance(localX, localY, remoteX, remoteY);
      const connected = this.peerManager.isConnected(sessionId);
      const remoteInMeeting = this.isInsideMeeting(remoteX, remoteY);
      const bothInMeeting = localInMeeting && remoteInMeeting;
      const remoteInComputerZone = Boolean(computerParticipants?.[sessionId]);
      const isolateComputerZone = localInComputerZone || remoteInComputerZone;

      if (isolateComputerZone) {
        if (connected) {
          this.peerManager.disconnectFromPeer(sessionId);
        }
      } else if (bothInMeeting || distance < PROXIMITY_RADIUS) {
        if (!connected) {
          this.peerManager.connectToPeer(sessionId);
        }
      } else if (connected) {
        this.peerManager.disconnectFromPeer(sessionId);
      }

      const videoElement = this.peerManager.videoOverlay?.getVideoElement?.(sessionId);
      if (videoElement) {
        const volume = smoothFalloff(distance, PROXIMITY_RADIUS);
        videoElement.volume = connected && !isolateComputerZone ? (bothInMeeting ? 1 : volume) : 0;
      }
    });

    const connectedSessions = this.peerManager.getConnectedSessionIds?.() || new Set();
    connectedSessions.forEach((sessionId) => {
      if (sessionId && sessionId !== localSessionId && !seenSessions.has(sessionId)) {
        this.peerManager.disconnectFromPeer(sessionId);
      }
    });
  }

  stop() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.running = false;
  }

  pause(disconnectExisting = true) {
    this.paused = true;

    if (!disconnectExisting || !this.peerManager) {
      return;
    }

    const connectedSessions = this.peerManager.getConnectedSessionIds?.();
    connectedSessions?.forEach?.((sessionId) => {
      this.peerManager.disconnectFromPeer?.(sessionId);
    });
  }

  resume() {
    this.paused = false;
    this.tick();
  }

  destroy() {
    this.stop();
    if (this.toastHideTimer) {
      window.clearTimeout(this.toastHideTimer);
      this.toastHideTimer = null;
    }
    this.toastElement?.remove();
    this.toastElement = null;
    this.scene = null;
    this.peerManager = null;
  }
}

export default ProximityManager;