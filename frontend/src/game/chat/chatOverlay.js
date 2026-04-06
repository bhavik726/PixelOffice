import './chat.css';

const CHAT_HIDDEN_KEY = 'pixel_office_chat_hidden';

function getStoredBoolean(key, fallback = false) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function setStoredBoolean(key, value) {
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    // ignore storage failures
  }
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 180);
}

function createMessageNode(message) {
  const item = document.createElement('div');
  item.className = 'po-chat-message';

  const from = document.createElement('div');
  from.className = 'po-chat-message__from';
  from.textContent = message.from || 'Unknown';

  const text = document.createElement('div');
  text.className = 'po-chat-message__text';
  text.textContent = message.text;

  item.append(from, text);
  return item;
}

export default class ChatOverlay {
  constructor(scene) {
    this.scene = scene;
    this.room = null;
    this.root = null;
    this.shell = null;
    this.log = null;
    this.input = null;
    this.sendButton = null;
    this.toggleButton = null;
    this.emptyState = null;
    this.messageCount = 0;
    this.isCollapsed = getStoredBoolean(CHAT_HIDDEN_KEY, false);
    this.boundChatHandler = null;
    this.boundDestroyHandler = null;
    this.boundWindowKeydown = null;
    this.boundInputKeydown = null;
    this.lockedForChat = false;
  }

  mount() {
    if (this.root) {
      return this.root;
    }

    const root = document.createElement('div');
    root.className = 'po-chat-overlay';

    const shell = document.createElement('div');
    shell.className = 'po-chat-shell';
    shell.dataset.collapsed = this.isCollapsed ? 'true' : 'false';

    const header = document.createElement('div');
    header.className = 'po-chat-header';

    const title = document.createElement('span');
    title.textContent = 'Room Chat';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.title = this.isCollapsed ? 'Show chat' : 'Hide chat';
    toggleButton.textContent = this.isCollapsed ? '+' : '-';

    header.append(title, toggleButton);

    const body = document.createElement('div');
    body.className = 'po-chat-body';

    const log = document.createElement('div');
    log.className = 'po-chat-log';

    const emptyState = document.createElement('div');
    emptyState.className = 'po-chat-empty';
    emptyState.textContent = 'Type a message to talk to everyone in the room.';
    log.appendChild(emptyState);

    const composer = document.createElement('form');
    composer.className = 'po-chat-composer';

    const input = document.createElement('input');
    input.className = 'po-chat-input';
    input.type = 'text';
    input.maxLength = 180;
    input.placeholder = 'Message everyone...';
    input.autocomplete = 'off';
    input.spellcheck = false;

    const sendButton = document.createElement('button');
    sendButton.className = 'po-chat-send';
    sendButton.type = 'submit';
    sendButton.textContent = 'Send';

    composer.append(input, sendButton);
    body.append(log, composer);
    shell.append(header, body);
    root.appendChild(shell);

    toggleButton.addEventListener('click', () => {
      this.setCollapsed(!this.isCollapsed, true);
    });

    composer.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.sendCurrentMessage();
    });

    this.boundInputKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        input.blur();
        return;
      }

      // Keep game-level key listeners from reacting while user types.
      event.stopPropagation();
    };

    input.addEventListener('keydown', this.boundInputKeydown);
    input.addEventListener('keyup', (event) => {
      event.stopPropagation();
    });

    input.addEventListener('focus', () => {
      this.scene.chatInputActive = true;
      this.lockedForChat = !this.scene.player?.isMovementLocked && !this.scene.player?.isSitting;
      if (this.lockedForChat) {
        this.scene.player?.setMovementLocked?.(true);
      }
    });

    input.addEventListener('blur', () => {
      this.scene.chatInputActive = false;
      if (this.lockedForChat) {
        this.scene.player?.setMovementLocked?.(false);
      }
      this.lockedForChat = false;
    });

    this.root = root;
    this.shell = shell;
    this.log = log;
    this.input = input;
    this.sendButton = sendButton;
    this.toggleButton = toggleButton;
    this.emptyState = emptyState;

    document.body.appendChild(root);
    this.setCollapsed(this.isCollapsed, false);
    return root;
  }

  bindRoom(room) {
    this.room = room;
    this.mount();

    this.boundChatHandler = (payload) => {
      const normalized = {
        sessionId: payload?.sessionId || '',
        from: payload?.from || 'Unknown',
        text: normalizeText(payload?.text),
        timestamp: Number(payload?.timestamp) || Date.now(),
      };

      if (!normalized.text) {
        return;
      }

      this.pushMessage(normalized);

      if (normalized.sessionId) {
        this.scene.showChatBubble?.(normalized.sessionId, normalized.from, normalized.text);
      }
    };

    this.room.onMessage('chat', this.boundChatHandler);

    this.boundWindowKeydown = (event) => {
      const activeElement = document.activeElement;
      const inputFocused = activeElement === this.input;

      // Enter opens chat quickly when user is in gameplay mode.
      if (!inputFocused && event.key === 'Enter') {
        if (this.isCollapsed) {
          this.setCollapsed(false, false);
        }
        this.input?.focus?.();
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', this.boundWindowKeydown);

    this.boundDestroyHandler = () => {
      this.destroy();
    };
    this.scene.events.once('shutdown', this.boundDestroyHandler);
    this.scene.events.once('destroy', this.boundDestroyHandler);
  }

  setCollapsed(nextCollapsed, shouldFocus = false) {
    this.isCollapsed = Boolean(nextCollapsed);
    if (this.shell) {
      this.shell.dataset.collapsed = this.isCollapsed ? 'true' : 'false';
    }
    if (this.toggleButton) {
      this.toggleButton.textContent = this.isCollapsed ? '+' : '-';
      this.toggleButton.title = this.isCollapsed ? 'Show chat' : 'Hide chat';
    }
    setStoredBoolean(CHAT_HIDDEN_KEY, this.isCollapsed);
    if (shouldFocus && !this.isCollapsed) {
      this.input?.focus?.();
    }
  }

  pushMessage(message) {
    this.mount();

    if (this.emptyState) {
      this.emptyState.remove();
      this.emptyState = null;
    }

    const node = createMessageNode(message);
    this.log?.appendChild(node);
    this.messageCount += 1;

    while (this.log && this.log.children.length > 24) {
      const first = this.log.firstElementChild;
      if (!first) break;
      this.log.removeChild(first);
    }

    if (this.log) {
      this.log.scrollTop = this.log.scrollHeight;
    }
  }

  async sendCurrentMessage() {
    const text = normalizeText(this.input?.value || '');
    if (!text || !this.room) {
      return;
    }

    this.room.send('chat', { text });
    if (this.input) {
      this.input.value = '';
      this.input.focus();
    }
  }

  destroy() {
    this.scene.chatInputActive = false;
    if (this.lockedForChat) {
      this.scene.player?.setMovementLocked?.(false);
    }
    this.lockedForChat = false;

    if (this.boundWindowKeydown) {
      window.removeEventListener('keydown', this.boundWindowKeydown);
      this.boundWindowKeydown = null;
    }

    if (this.input && this.boundInputKeydown) {
      this.input.removeEventListener('keydown', this.boundInputKeydown);
    }
    this.boundInputKeydown = null;

    if (this.root) {
      this.root.remove();
      this.root = null;
    }

    this.shell = null;
    this.log = null;
    this.input = null;
    this.sendButton = null;
    this.toggleButton = null;
    this.emptyState = null;
    this.room = null;
  }
}