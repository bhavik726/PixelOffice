import './wboOverlay.css';

const DEFAULT_LOCAL_WHITEBOARD_URL = 'http://127.0.0.1:8080';

function getMetaValue(name) {
  if (typeof document === 'undefined') {
    return '';
  }

  return document.querySelector(`meta[name="${name}"]`)?.content || '';
}

function resolveAbsoluteUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) {
    return '';
  }

  try {
    return new URL(trimmed, window.location.origin).toString();
  } catch {
    return trimmed;
  }
}

function ensureTrailingSlash(url) {
  if (!url) {
    return '';
  }

  return url.endsWith('/') ? url : `${url}/`;
}

function getWhiteboardBaseUrl() {
  const importMetaValue =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WHITEBOARD_BASE_URL) || '';
  const runtimeValue =
    typeof window !== 'undefined' ? window.__WHITEBOARD_BASE_URL__ : '';
  const metaValue = getMetaValue('whiteboard-base-url');

  const candidate = String(importMetaValue || runtimeValue || metaValue || '').trim();
  if (candidate) {
    return resolveAbsoluteUrl(candidate);
  }

  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return DEFAULT_LOCAL_WHITEBOARD_URL;
  }

  return window.location.origin;
}

function buildWhiteboardBoardUrl(baseUrl, boardId) {
  const normalizedBaseUrl = ensureTrailingSlash(resolveAbsoluteUrl(baseUrl) || DEFAULT_LOCAL_WHITEBOARD_URL);
  return new URL(`boards/${encodeURIComponent(boardId)}`, normalizedBaseUrl).toString();
}

export default class WBOOverlay {
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.overlay = null;
    this.container = null;
    this.iframe = null;
    this.isOpen = false;
    this.boardId = null;
    this.boundKeydown = null;
    this.boundOverlayClick = null;
    this.boundContainerClick = null;
    this.boundIframeLoad = null;
    this.boundIframeError = null;
    this.wasMovementLockedBeforeOpen = false;
    this.lastClosedAt = 0;
    this.lockedPlayer = false;
    this.whiteboardBaseUrl = getWhiteboardBaseUrl();
    this.loadingOverlay = null;
    this.loadingText = null;
    this.closeHint = null;
    this.loadingSlowTimerId = null;
  }

  mount() {
    if (this.root) {
      return this.root;
    }

    const root = document.createElement('div');
    root.className = 'wbo-modal';
    root.setAttribute('aria-hidden', 'true');

    const overlay = document.createElement('div');
    overlay.className = 'wbo-overlay';

    const container = document.createElement('div');
    container.className = 'wbo-container';

    const closeHint = document.createElement('div');
    closeHint.className = 'wbo-close-hint';
    closeHint.textContent = 'Press R to close';

    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'wbo-loading';

    const spinner = document.createElement('div');
    spinner.className = 'wbo-spinner';
    spinner.setAttribute('aria-hidden', 'true');

    const loadingText = document.createElement('p');
    loadingText.className = 'wbo-loading-text';
    loadingText.textContent = 'Opening whiteboard...';

    loadingOverlay.append(spinner, loadingText);

    const iframe = document.createElement('iframe');
    iframe.className = 'wbo-iframe';
    iframe.setAttribute('title', 'WBO Whiteboard');
    iframe.setAttribute('loading', 'eager');
    iframe.style.background = '#fff';
    iframe.style.pointerEvents = 'auto';
    this.boundIframeLoad = () => {
      this.setLoadingState(false);
    };
    this.boundIframeError = () => {
      this.setLoadingState(true, 'Whiteboard is taking longer than usual...');
      console.error('WBO failed to load');
    };
    iframe.addEventListener('load', this.boundIframeLoad);
    iframe.addEventListener('error', this.boundIframeError);

    container.append(iframe, loadingOverlay, closeHint);
    overlay.append(container);
    root.appendChild(overlay);
    document.body.appendChild(root);

    this.boundOverlayClick = (event) => {
      if (event.target === overlay) {
        this.close();
      }
    };
    overlay.addEventListener('click', this.boundOverlayClick);

    this.boundContainerClick = (event) => {
      event.stopPropagation();
    };
    container.addEventListener('click', this.boundContainerClick);

    this.boundKeydown = (event) => {
      if (!this.isOpen) {
        return;
      }

      const key = String(event.key || '').toLowerCase();
      if (key === 'escape' || key === 'r') {
        event.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this.boundKeydown);

    this.root = root;
    this.overlay = overlay;
    this.container = container;
    this.iframe = iframe;
    this.loadingOverlay = loadingOverlay;
    this.loadingText = loadingText;
    this.closeHint = closeHint;

    return root;
  }

  setLoadingState(isLoading, message = 'Opening whiteboard...') {
    if (!this.loadingOverlay) {
      return;
    }

    this.loadingOverlay.classList.toggle('is-hidden', !isLoading);
    this.loadingOverlay.setAttribute('aria-hidden', String(!isLoading));

    if (this.loadingText) {
      this.loadingText.textContent = message;
    }

    if (this.closeHint) {
      this.closeHint.style.display = isLoading ? 'none' : 'block';
    }

    if (!isLoading && this.loadingSlowTimerId) {
      window.clearTimeout(this.loadingSlowTimerId);
      this.loadingSlowTimerId = null;
    }
  }

  open(boardId) {
    if (!boardId || typeof boardId !== 'string') {
      console.warn('WBOOverlay.open() requires a valid boardId');
      return;
    }

    this.mount();

    const normalizedBoardId = boardId.trim();
    if (!normalizedBoardId) {
      console.warn('WBOOverlay.open() called with empty boardId');
      return;
    }

    const now = Date.now();
    if (now - this.lastClosedAt < 350) {
      return;
    }

    this.boardId = normalizedBoardId;
    if (this.isOpen && this.root.classList.contains('is-open') && this.iframe?.src.includes(encodeURIComponent(this.boardId))) {
      return;
    }
    this.root.classList.add('is-open');
    this.root.setAttribute('aria-hidden', 'false');
    this.isOpen = true;

    // Track and lock movement while whiteboard is open.
    this.wasMovementLockedBeforeOpen = Boolean(this.scene?.player?.isMovementLocked);
    if (this.scene?.player?.setMovementLocked) {
      this.scene.player.setMovementLocked(true);
      this.lockedPlayer = true;
    }

    // Set scene flag to prevent interaction
    if (this.scene) {
      this.scene.whiteboardActive = true;
    }

    this.root.dataset.state = 'open';
    this.setLoadingState(true, 'Opening whiteboard...');

    // Load the configured WBO board service.
    const wboUrl = buildWhiteboardBoardUrl(this.whiteboardBaseUrl, this.boardId);
    this.iframe.src = wboUrl;
  }

  close() {
    if (!this.root) {
      return;
    }

    // Force close even if local flags got desynced.
    this.isOpen = false;
    this.lastClosedAt = Date.now();
    this.root.dataset.state = 'closed';
    this.root.classList.remove('is-open');
    this.root.setAttribute('aria-hidden', 'true');
    this.setLoadingState(true, 'Opening whiteboard...');
    if (this.loadingSlowTimerId) {
      window.clearTimeout(this.loadingSlowTimerId);
      this.loadingSlowTimerId = null;
    }
    if (this.iframe) {
      this.iframe.src = 'about:blank';
    }

    if (this.scene) {
      this.scene.whiteboardActive = false;
    }

    if (this.scene?.player?.setMovementLocked) {
      this.scene.player.setMovementLocked(this.wasMovementLockedBeforeOpen);
    }

    if (this.scene?.input?.keyboard?.resetKeys) {
      this.scene.input.keyboard.resetKeys();
    }

    this.lockedPlayer = false;

    // Release pointer lock if WBO captured it.
    if (document.pointerLockElement && typeof document.exitPointerLock === 'function') {
      try {
        document.exitPointerLock();
      } catch {
        // ignore pointer lock release failures
      }
    }

    // Return keyboard focus to the Phaser canvas.
    try {
      const canvas = this.scene.game.canvas;
      if (canvas) {
        canvas.setAttribute('tabindex', '0');
        canvas.focus();
      }
    } catch {
      // ignore focus restoration failures
    }

    this.boardId = null;
  }

  destroy() {
    this.close();

    if (this.overlay && this.boundOverlayClick) {
      this.overlay.removeEventListener('click', this.boundOverlayClick);
    }

    if (this.container && this.boundContainerClick) {
      this.container.removeEventListener('click', this.boundContainerClick);
    }

    if (this.iframe && this.boundIframeLoad) {
      this.iframe.removeEventListener('load', this.boundIframeLoad);
    }

    if (this.iframe && this.boundIframeError) {
      this.iframe.removeEventListener('error', this.boundIframeError);
    }

    if (this.loadingSlowTimerId) {
      window.clearTimeout(this.loadingSlowTimerId);
      this.loadingSlowTimerId = null;
    }

    window.removeEventListener('keydown', this.boundKeydown);
    this.root?.remove();
    this.root = null;
    this.overlay = null;
    this.container = null;
    this.iframe = null;
    this.loadingOverlay = null;
    this.loadingText = null;
    this.boundCloseHandler = null;
    this.boundOverlayClick = null;
    this.boundContainerClick = null;
    this.boundIframeLoad = null;
    this.boundIframeError = null;
  }
}
