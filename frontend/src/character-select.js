const COLYSEUS_ROOM_ID_STORAGE_KEY = 'colyseus_room_id';
const DISPLAY_NAME_STORAGE_KEY = 'pixel_office_display_name';
const CHARACTER_KEY_STORAGE_KEY = 'pixel_office_character_key';
const LOBBY_THEME_STORAGE_KEY = 'pixel_office_lobby_theme';

const CHARACTER_OPTIONS = [
  { key: 'adam', label: 'Adam', preview: '/assets/character/selection/Adam.png' },
  { key: 'ash', label: 'Ash', preview: '/assets/character/selection/Ash.png' },
  { key: 'lucy', label: 'Lucy', preview: '/assets/character/selection/Lucy.png' },
  { key: 'nancy', label: 'Nancy', preview: '/assets/character/selection/Nancy.png' },
];

const characterPreviewEl = document.getElementById('characterPreview');
const characterChooserEl = document.getElementById('characterChooser');
const characterBadgeEl = document.getElementById('characterBadge');
const selectedNamePillEl = document.getElementById('selectedNamePill');
const displayNameInput = document.getElementById('displayNameInput');
const selectionErrorEl = document.getElementById('selectionError');
const prevCharacterBtn = document.getElementById('prevCharacterBtn');
const nextCharacterBtn = document.getElementById('nextCharacterBtn');
const continueBtn = document.getElementById('continueBtn');
const backBtn = document.getElementById('backBtn');

let selectedIndex = 0;

function getStoredValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures in browser privacy mode
  }
}

function redirectToLobby() {
  window.location.href = '/lobby.html';
}

function redirectToGame() {
  window.location.href = '/';
}

function getSelectedCharacter() {
  return CHARACTER_OPTIONS[selectedIndex] || CHARACTER_OPTIONS[0];
}

function applyStoredTheme() {
  let initialMode = 'day';

  try {
    const storedMode = window.localStorage.getItem(LOBBY_THEME_STORAGE_KEY);
    if (storedMode === 'night' || storedMode === 'day') {
      initialMode = storedMode;
    }
  } catch {
    // ignore storage read failures
  }

  document.body.setAttribute('data-mode', initialMode);
}

function renderCharacterChooser() {
  characterChooserEl.innerHTML = '';

  CHARACTER_OPTIONS.forEach((character, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.dataset.active = index === selectedIndex ? 'true' : 'false';
    button.innerHTML = `
      <img src="${character.preview}" alt="${character.label}" />
      <span>${character.label}</span>
    `;

    button.addEventListener('click', () => {
      selectedIndex = index;
      syncSelection();
    });

    characterChooserEl.appendChild(button);
  });
}

function syncSelection() {
  const selectedCharacter = getSelectedCharacter();
  characterPreviewEl.src = selectedCharacter.preview;
  characterPreviewEl.alt = `${selectedCharacter.label} preview`;
  if (characterBadgeEl) {
    characterBadgeEl.textContent = selectedCharacter.label.slice(0, 2).toUpperCase();
  }
  renderCharacterChooser();
}

function updateNamePreview() {
  const value = String(displayNameInput.value || '').trim() || 'Anonymous';
  if (selectedNamePillEl) {
    selectedNamePillEl.textContent = `Name: ${value}`;
  }
}

function loadInitialState() {
  const storedName = getStoredValue(DISPLAY_NAME_STORAGE_KEY);
  const storedCharacterKey = getStoredValue(CHARACTER_KEY_STORAGE_KEY);

  if (storedName) {
    displayNameInput.value = storedName;
  }

  const storedIndex = CHARACTER_OPTIONS.findIndex((item) => item.key === storedCharacterKey);
  selectedIndex = storedIndex >= 0 ? storedIndex : 0;

  syncSelection();
  updateNamePreview();
}

function validateRoomReady() {
  const roomId = getStoredValue(COLYSEUS_ROOM_ID_STORAGE_KEY);

  if (!roomId) {
    redirectToLobby();
    return false;
  }

  return true;
}

continueBtn.addEventListener('click', () => {
  const displayName = String(displayNameInput.value || '').trim();
  const selectedCharacter = getSelectedCharacter();

  if (!displayName) {
    selectionErrorEl.textContent = 'Please enter a display name.';
    return;
  }

  selectionErrorEl.textContent = '';
  setStoredValue(DISPLAY_NAME_STORAGE_KEY, displayName);
  setStoredValue(CHARACTER_KEY_STORAGE_KEY, selectedCharacter.key);
  redirectToGame();
});

backBtn.addEventListener('click', () => {
  redirectToLobby();
});

prevCharacterBtn.addEventListener('click', () => {
  selectedIndex = (selectedIndex - 1 + CHARACTER_OPTIONS.length) % CHARACTER_OPTIONS.length;
  syncSelection();
});

nextCharacterBtn.addEventListener('click', () => {
  selectedIndex = (selectedIndex + 1) % CHARACTER_OPTIONS.length;
  syncSelection();
});

displayNameInput.addEventListener('input', updateNamePreview);
displayNameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    continueBtn.click();
  }
});

if (validateRoomReady()) {
  applyStoredTheme();
  loadInitialState();
}
