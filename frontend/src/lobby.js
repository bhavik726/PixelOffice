const COLYSEUS_ROOM_ID_STORAGE_KEY = "colyseus_room_id";
const GUEST_ID_STORAGE_KEY = "pixel_office_guest_id";
const CHARACTER_SELECT_PAGE = "/select-character.html";

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  "http://127.0.0.1:4000";

const roomsListEl = document.getElementById("roomsList");
const refreshRoomsBtn = document.getElementById("refreshRoomsBtn");

const privateTabsEl = document.getElementById("privateTabs");
const createPanelEl = document.getElementById("privateCreatePanel");
const findPanelEl = document.getElementById("privateFindPanel");

const publicConnectBtn = document.getElementById("publicConnectBtn");
const publicConnectSpinner = document.getElementById("publicConnectSpinner");
const publicErrorEl = document.getElementById("publicError");

const createRoomForm = document.getElementById("createRoomForm");
const createRoomBtn = document.getElementById("createRoomBtn");
const createRoomLabel = document.getElementById("createRoomLabel");
const createRoomSpinner = document.getElementById("createRoomSpinner");
const createRoomErrorEl = document.getElementById("createRoomError");

const findRoomsErrorEl = document.getElementById("findRoomsError");

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.textContent = "Reset Guest";
}

const entryPublicBtn = document.getElementById("entryPublicBtn");
const entryPrivateBtn = document.getElementById("entryPrivateBtn");
const entryStatusEl = document.getElementById("entryStatus");
const privateWorkspaceEl = document.getElementById("privateWorkspace");
const connectionLoaderWrap = document.getElementById("connectionLoaderWrap");
const connectionLoaderEl = document.getElementById("connection-loader");
const connectionBarEl = document.getElementById("connection-bar");
const connectionStatusEl = document.getElementById("connection-status");

const COLYSEUS_SERVER =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_COLYSEUS_URL) ||
  "ws://127.0.0.1:2567";

let joiningRoomBusy = false;
let privateRoomsLoaded = false;
let publicConnectionBusy = false;

function setEntryStatus(message) {
  if (!entryStatusEl) return;
  entryStatusEl.textContent = String(message || "");
}

function setEntryMode(mode) {
  const isPrivate = mode === "private";

  if (entryPublicBtn) entryPublicBtn.dataset.active = isPrivate ? "false" : "true";
  if (entryPrivateBtn) entryPrivateBtn.dataset.active = isPrivate ? "true" : "false";

  if (privateWorkspaceEl) {
    privateWorkspaceEl.style.display = isPrivate ? "block" : "none";
  }

  if (isPrivate) {
    setEntryStatus("Private mode active. Create a room or find an existing one.");
  } else {
    setEntryStatus("Connecting to the public room...");
  }
}

async function ensurePrivateRoomsLoaded() {
  if (privateRoomsLoaded) return;
  await loadPrivateRoomsAndRender();
  privateRoomsLoaded = true;
}

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
    // ignore storage failures
  }
}

function ensureGuestId() {
  const existing = getStoredValue(GUEST_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  setStoredValue(GUEST_ID_STORAGE_KEY, generated);
  return generated;
}

function setInlineError(el, message) {
  el.style.display = "block";
  el.textContent = message;
}

function clearInlineError(el) {
  el.style.display = "none";
  el.textContent = "";
}

function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

function setButtonLoading({ button, labelEl, spinnerEl, loading, label }) {
  button.disabled = loading;
  if (labelEl && label) labelEl.textContent = label;
  if (spinnerEl) spinnerEl.style.display = loading ? "inline-block" : "none";
}

function setConnectionButtonsDisabled(disabled) {
  const controls = [entryPublicBtn, entryPrivateBtn, refreshRoomsBtn, createRoomBtn];
  controls.forEach((el) => {
    if (!el) return;
    el.disabled = Boolean(disabled);
    el.style.opacity = disabled ? "0.6" : "";
  });
}

function setConnectionLoaderVisible(visible) {
  if (!connectionLoaderWrap) return;
  connectionLoaderWrap.dataset.visible = visible ? "true" : "false";
}

function setProgress(progress, text) {
  const normalized = Math.max(0, Math.min(100, Number(progress) || 0));

  if (connectionBarEl) {
    connectionBarEl.style.width = `${normalized}%`;
  }

  if (connectionStatusEl) {
    connectionStatusEl.textContent = String(text || "");
  }

  if (connectionLoaderEl) {
    connectionLoaderEl.setAttribute("aria-valuenow", String(Math.round(normalized)));
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForBackend() {
  const startedAt = Date.now();
  const timeoutMs = 45000;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/rooms/public`, { method: "GET" });
      if (res.ok) {
        return;
      }
    } catch {
      // backend still waking
    }

    const elapsed = Date.now() - startedAt;
    const ratio = Math.min(1, elapsed / timeoutMs);
    const stageProgress = 10 + ratio * 50;
    setProgress(stageProgress, "Waking server (may take ~30s)");

    await sleep(1200);
  }

  throw new Error("Backend is taking too long to wake up. Please try again.");
}

async function connectToColyseus() {
  const wsUrl = COLYSEUS_SERVER.replace(/^http/i, "ws");

  await new Promise((resolve, reject) => {
    let settled = false;
    let socket;

    try {
      socket = new WebSocket(wsUrl);
    } catch {
      reject(new Error("Could not open realtime connection."));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // ignore close failure
      }
      reject(new Error("Realtime server did not respond."));
    }, 7000);

    socket.onopen = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      try {
        socket.close();
      } catch {
        // ignore close failure
      }
      resolve();
    };

    socket.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(new Error("Unable to connect to realtime server."));
    };
  });
}

async function findPublicRoom() {
  const res = await apiFetch(`${API_BASE_URL}/rooms/public`, { method: "GET" });
  const publics = await res.json().catch(() => []);

  const publicRoom = Array.isArray(publics)
    ? publics.find((r) => r.type === "public") || publics[0] || null
    : null;

  if (!publicRoom) {
    throw new Error("Public lobby is not available yet. Please retry in a few seconds.");
  }

  if (!publicRoom?.id) {
    throw new Error("Public room missing id");
  }

  return publicRoom;
}

async function joinPublicRoom(roomId) {
  const joinRes = await apiFetch(`${API_BASE_URL}/rooms/join`, {
    method: "POST",
    body: JSON.stringify({ room_id: roomId }),
  });
  const joinData = await joinRes.json().catch(() => ({}));
  if (!joinRes.ok) {
    throw new Error(joinData.message || "Failed to join public lobby");
  }

  const colyseusRoomId = joinData.colyseus_room_id;
  if (!colyseusRoomId) throw new Error("Missing colyseus_room_id from join response");

  return colyseusRoomId;
}

function normalizeJoinErrorMessage(message) {
  const m = String(message || "").toLowerCase();
  if (m.includes("invalid room password")) return "Incorrect password";
  return String(message || "Failed to join room");
}

function togglePrivatePanel(mode) {
  const createActive = mode === "create";
  createPanelEl.style.display = createActive ? "block" : "none";
  findPanelEl.style.display = createActive ? "none" : "block";

  privateTabsEl.querySelectorAll(".tab").forEach((tab) => {
    tab.dataset.active = tab.dataset.mode === mode ? "true" : "false";
  });
}

privateTabsEl.addEventListener("click", (event) => {
  const tab = event.target.closest(".tab");
  if (!tab) return;
  togglePrivatePanel(tab.dataset.mode === "find" ? "find" : "create");
});

logoutBtn.addEventListener("click", () => {
  try {
    window.localStorage.removeItem(GUEST_ID_STORAGE_KEY);
    window.localStorage.removeItem(COLYSEUS_ROOM_ID_STORAGE_KEY);
  } catch {
    // ignore
  }
  window.location.href = "/lobby.html";
});

refreshRoomsBtn.addEventListener("click", () => {
  void loadPrivateRoomsAndRender();
});

function renderRooms(rooms) {
  roomsListEl.innerHTML = "";

  if (!rooms.length) {
    const empty = document.createElement("div");
    empty.style.color = "var(--muted)";
    empty.style.fontSize = "13px";
    empty.textContent = "No private rooms found.";
    roomsListEl.appendChild(empty);
    return;
  }

  rooms.forEach((room) => {
    const card = document.createElement("div");
    card.className = "room-card";
    card.dataset.roomId = room.id;

    const hasPassword = !!(room.password && String(room.password).trim().length > 0);
    const lockSvg = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 11V8.5C7 5.46243 9.46243 3 12.5 3C15.5376 3 18 5.46243 18 8.5V11" stroke="rgba(249,250,251,0.9)" stroke-width="2" stroke-linecap="round"/>
        <path d="M6 11H19C20.1046 11 21 11.8954 21 13V19C21 20.1046 20.1046 21 19 21H6C4.89543 21 4 20.1046 4 19V13C4 11.8954 4.89543 11 6 11Z" stroke="rgba(249,250,251,0.9)" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `;

    const desc = room.description ? String(room.description) : "";
    card.innerHTML = `
      <div class="room-top">
        <div>
          <div class="room-name">${room.name || "Untitled Room"}</div>
          <div class="room-desc">${desc ? desc : "No description"}</div>
        </div>
        <div class="lock-badge" style="visibility: ${hasPassword ? "visible" : "hidden"}">${lockSvg}</div>
      </div>
      <div style="margin-top:10px; display:flex; gap:8px; align-items:center;">
        <button type="button" class="mini-btn joinBtn" ${hasPassword ? "" : "style=\"width:100%\""}>Join</button>
      </div>
      <div class="error" data-error-for="${room.id}" style="display:none"></div>
      ${hasPassword ? `<div class="password-inline" data-passbox-for="${room.id}" style="display:none">
        <input type="password" placeholder="Enter password" />
        <button type="button" class="mini-btn joinWithPasswordBtn">Join</button>
      </div>` : ""}
    `;

    const joinBtn = card.querySelector(".joinBtn");
    const errorEl = card.querySelector(`[data-error-for="${room.id}"]`);
    const passbox = card.querySelector(`[data-passbox-for="${room.id}"]`);
    const joinWithPasswordBtn = card.querySelector(".joinWithPasswordBtn");
    const onResetError = () => {
      errorEl.style.display = "none";
      errorEl.textContent = "";
    };

    joinBtn.addEventListener("click", () => {
      onResetError();
      if (joiningRoomBusy) return;

      if (!hasPassword) {
        void joinRoomNow(room.id, null, card);
        return;
      }

      // Toggle inline password box
      roomsListEl.querySelectorAll("[data-passbox-for]").forEach((el) => {
        el.style.display = el.getAttribute("data-passbox-for") === room.id ? "flex" : "none";
      });
      passbox.style.display = "flex";

      const input = passbox.querySelector("input");
      input?.focus?.();
    });

    joinWithPasswordBtn?.addEventListener("click", () => {
      onResetError();
      if (joiningRoomBusy) return;
      const input = passbox.querySelector("input");
      const password = input?.value ? String(input.value) : "";
      void joinRoomNow(room.id, password, card);
    });

    roomsListEl.appendChild(card);
  });
}

async function loadPrivateRoomsAndRender() {
  clearInlineError(findRoomsErrorEl);
  roomsListEl.innerHTML = "";

  const refreshMode = "find";
  void refreshMode;

  try {
    // The backend must expose an endpoint that returns ALL rooms (including private)
    // so we can filter out public rooms here.
    const res = await apiFetch(`${API_BASE_URL}/rooms`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const allRooms = await res.json();
    const privateRooms = (allRooms || []).filter((r) => r.type !== "public");
    renderRooms(privateRooms);
  } catch {
    // Your current backend only exposes GET /rooms/public, which returns public rooms only.
    // Without GET /rooms (all rooms) or GET /rooms/private, the frontend cannot list private rooms.
    setInlineError(
      findRoomsErrorEl,
      "Find Room can't load private rooms because your backend doesn't currently expose a 'list all rooms' endpoint.\n" +
        "Right now it only has GET /rooms/public.\n" +
        "To enable Find Room, add an endpoint like GET /rooms (all) or GET /rooms/private that returns private rooms too."
    );

    renderRooms([]);
  }
}

async function joinRoomNow(roomId, password, cardEl) {
  joiningRoomBusy = true;

  const errorEl = cardEl.querySelector(`[data-error-for="${roomId}"]`);
  if (errorEl) clearInlineError(errorEl);

  const joinBtn = cardEl.querySelector(".joinBtn");
  const passJoinBtn = cardEl.querySelector(".joinWithPasswordBtn");
  if (joinBtn) joinBtn.disabled = true;
  if (passJoinBtn) passJoinBtn.disabled = true;

  try {
    const body = password ? { room_id: roomId, password } : { room_id: roomId };
    const res = await apiFetch(`${API_BASE_URL}/rooms/join`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || "Join failed");
    }

    const colyseusRoomId = data.colyseus_room_id;
    if (!colyseusRoomId) {
      throw new Error("Missing colyseus_room_id in join response");
    }

    window.localStorage.setItem(COLYSEUS_ROOM_ID_STORAGE_KEY, colyseusRoomId);
    window.location.href = CHARACTER_SELECT_PAGE;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const normalized = normalizeJoinErrorMessage(message);
    const errBox = cardEl.querySelector(`[data-error-for="${roomId}"]`);
    if (errBox) setInlineError(errBox, normalized);
  } finally {
    joiningRoomBusy = false;
    const jb = cardEl.querySelector(".joinBtn");
    const pb = cardEl.querySelector(".joinWithPasswordBtn");
    if (jb) jb.disabled = false;
    if (pb) pb.disabled = false;
  }
}

publicConnectBtn.addEventListener("click", () => {
  void connectPublicLobby();
});

entryPublicBtn?.addEventListener("click", () => {
  setEntryMode("public");
  void connectPublicLobby();
});

entryPrivateBtn?.addEventListener("click", () => {
  setEntryMode("private");
  void ensurePrivateRoomsLoaded();
});

async function connectPublicLobby() {
  if (publicConnectionBusy) {
    return;
  }

  publicConnectionBusy = true;
  publicConnectBtn.disabled = true;
  publicConnectSpinner.style.display = "inline-block";
  setConnectionButtonsDisabled(true);
  setConnectionLoaderVisible(true);
  setProgress(10, "Waking server...");
  publicErrorEl.style.display = "none";
  publicErrorEl.textContent = "";

  try {
    await waitForBackend();

    setProgress(60, "Connecting...");
    await connectToColyseus();

    setProgress(85, "Joining room...");
    const publicRoom = await findPublicRoom();
    const colyseusRoomId = await joinPublicRoom(publicRoom.id);

    setProgress(100, "Ready");

    window.localStorage.setItem(COLYSEUS_ROOM_ID_STORAGE_KEY, colyseusRoomId);
    await sleep(120);
    window.location.href = CHARACTER_SELECT_PAGE;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setInlineError(publicErrorEl, message);
    setProgress(0, "");
    setConnectionLoaderVisible(false);
  } finally {
    publicConnectBtn.disabled = false;
    publicConnectSpinner.style.display = "none";
    setConnectionButtonsDisabled(false);
    publicConnectionBusy = false;
  }
}

createRoomForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void createPrivateRoomAndJoin();
});

async function createPrivateRoomAndJoin() {
  clearInlineError(createRoomErrorEl);

  const formData = new FormData(createRoomForm);
  const name = String(formData.get("roomName") || "").trim();
  const description = String(formData.get("roomDesc") || "").trim();
  const password = String(formData.get("roomPassword") || "").trim();

  if (!name) {
    setInlineError(createRoomErrorEl, "Room name is required.");
    return;
  }

  setButtonLoading({
    button: createRoomBtn,
    labelEl: createRoomLabel,
    spinnerEl: createRoomSpinner,
    loading: true,
    label: "Creating...",
  });

  try {
    const payload = {
      name,
      description,
      guest_id: ensureGuestId(),
    };
    if (password) payload.password = password;

    const createRes = await apiFetch(`${API_BASE_URL}/rooms/create`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      throw new Error(createData.message || "Failed to create room");
    }

    if (!createData?.id) {
      throw new Error("Create response missing room id");
    }

    const joinRes = await apiFetch(`${API_BASE_URL}/rooms/join`, {
      method: "POST",
      body: JSON.stringify({
        room_id: createData.id,
        ...(password ? { password } : {}),
      }),
    });

    const joinData = await joinRes.json().catch(() => ({}));
    if (!joinRes.ok) {
      throw new Error(joinData.message || "Failed to join room");
    }

    const colyseusRoomId = joinData.colyseus_room_id;
    if (!colyseusRoomId) throw new Error("Missing colyseus_room_id in join response");

    window.localStorage.setItem(COLYSEUS_ROOM_ID_STORAGE_KEY, colyseusRoomId);
    window.location.href = "/";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setInlineError(createRoomErrorEl, message);
  } finally {
    setButtonLoading({
      button: createRoomBtn,
      labelEl: createRoomLabel,
      spinnerEl: createRoomSpinner,
      loading: false,
      label: "Create & Join",
    });
  }
}

// Auth guard
ensureGuestId();
togglePrivatePanel("create");
if (privateWorkspaceEl && entryPrivateBtn) {
  privateWorkspaceEl.style.display = "none";
  if (entryPublicBtn) entryPublicBtn.dataset.active = "false";
  entryPrivateBtn.dataset.active = "false";
  setEntryStatus("Select Private to create or find a room.");
} else {
  void ensurePrivateRoomsLoaded();
}

