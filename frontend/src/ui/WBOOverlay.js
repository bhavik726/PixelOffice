import './wboOverlay.css';

export default class WBOOverlay {
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.overlay = null;
    this.container = null;
    this.closeButton = null;
    this.iframe = null;
    this.isOpen = false;
    this.boardId = null;
    this.boundKeydown = null;
    this.boundOverlayClick = null;
    this.boundContainerClick = null;
    this.boundCloseHandler = null;
    this.wasMovementLockedBeforeOpen = false;
    this.lastClosedAt = 0;
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

    const header = document.createElement('div');
    header.className = 'wbo-header';

    const title = document.createElement('div');
    title.className = 'wbo-title';
    const titleStrong = document.createElement('strong');
    titleStrong.textContent = 'Whiteboard';
    const subtitle = document.createElement('span');
    subtitle.textContent = 'Shared whiteboard. Press Esc to close.';
    title.append(titleStrong, subtitle);

    const closeButton = document.createElement('button');
    closeButton.className = 'wbo-close-button';
    closeButton.type = 'button';
    closeButton.textContent = '✕';
    closeButton.title = 'Close whiteboard (Esc)';

    header.append(title, closeButton);

    const iframe = document.createElement('iframe');
    iframe.className = 'wbo-iframe';
    iframe.setAttribute('title', 'WBO Whiteboard');
    iframe.style.background = '#fff';
    iframe.style.pointerEvents = 'auto';
    iframe.onload = () => {
      if (iframe.src && !iframe.src.startsWith('about:blank')) {
        console.log('WBO loaded');
      }
    };
    iframe.onerror = () => console.error('WBO failed to load');

    container.append(header, iframe);
    overlay.append(container);
    root.appendChild(overlay);
    document.body.appendChild(root);

    this.boundCloseHandler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log('Closing WBO');
      this.close();
    };
    closeButton.addEventListener('click', this.boundCloseHandler);

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
      if (this.isOpen && event.key === 'Escape') {
        this.close();
      }
    };
    window.addEventListener('keydown', this.boundKeydown);

    this.root = root;
    this.overlay = overlay;
    this.container = container;
    this.closeButton = closeButton;
    this.iframe = iframe;

    return root;
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

    // Load WBO board
    const wboUrl = `http://localhost:8080/boards/${encodeURIComponent(this.boardId)}`;
    console.log('Loading WBO board:', wboUrl);
    this.iframe.src = 'about:blank';
    this.iframe.src = wboUrl;
  }

  close() {
    if (!this.root) {
      return;
    }

    // Force close even if local flags got desynced.
    this.isOpen = false;
    this.lastClosedAt = Date.now();
    this.root.classList.remove('is-open');
    this.root.setAttribute('aria-hidden', 'true');
    if (this.iframe) {
      this.iframe.src = 'about:blank';
    }

    this.scene.whiteboardActive = false;
    this.scene.player.setMovementLocked(false);
    this.scene.input.keyboard.resetKeys();
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

    if (this.closeButton && this.boundCloseHandler) {
      this.closeButton.removeEventListener('click', this.boundCloseHandler);
    }

    if (this.overlay && this.boundOverlayClick) {
      this.overlay.removeEventListener('click', this.boundOverlayClick);
    }

    if (this.container && this.boundContainerClick) {
      this.container.removeEventListener('click', this.boundContainerClick);
    }

    window.removeEventListener('keydown', this.boundKeydown);
    this.root?.remove();
    this.root = null;
    this.overlay = null;
    this.container = null;
    this.closeButton = null;
    this.iframe = null;
    this.boundCloseHandler = null;
    this.boundOverlayClick = null;
    this.boundContainerClick = null;
  }
}
