const AUTH_TOKEN_STORAGE_KEY = "supabase_access_token";
const COLYSEUS_ROOM_ID_STORAGE_KEY = "colyseus_room_id";
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
const publicConnectLabel = document.getElementById("publicConnectLabel");
const publicConnectSpinner = document.getElementById("publicConnectSpinner");
const publicErrorEl = document.getElementById("publicError");

const createRoomForm = document.getElementById("createRoomForm");
const createRoomBtn = document.getElementById("createRoomBtn");
const createRoomLabel = document.getElementById("createRoomLabel");
const createRoomSpinner = document.getElementById("createRoomSpinner");
const createRoomErrorEl = document.getElementById("createRoomError");

const findRoomsErrorEl = document.getElementById("findRoomsError");

const logoutBtn = document.getElementById("logoutBtn");

let activePasswordRoomId = null;
let joiningRoomBusy = false;

function getToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
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
  const token = getToken();
  if (!token) {
    throw new Error("Missing auth token");
  }

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

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
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
  window.location.href = "/login.html";
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
      activePasswordRoomId = room.id;
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
  } catch (e) {
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

async function connectPublicLobby() {
  publicConnectBtn.disabled = true;
  publicConnectSpinner.style.display = "inline-block";
  publicErrorEl.style.display = "none";
  publicErrorEl.textContent = "";

  try {
    // 1) Find existing public room
    const res = await apiFetch(`${API_BASE_URL}/rooms/public`, { method: "GET" });
    const publics = await res.json().catch(() => []);

    let publicRoom = Array.isArray(publics)
      ? publics.find((r) => r.type === "public") || publics[0] || null
      : null;

    // 2) If none exists, create it
    if (!publicRoom) {
      const createRes = await apiFetch(`${API_BASE_URL}/rooms/create`, {
        method: "POST",
        body: JSON.stringify({
          name: "Public Lobby",
          description: "",
          type: "public",
        }),
      });

      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        throw new Error(createData.message || "Failed to create public lobby");
      }

      publicRoom = createData;
    }

    if (!publicRoom?.id) {
      throw new Error("Public room missing id");
    }

    // 3) Join it
    const joinRes = await apiFetch(`${API_BASE_URL}/rooms/join`, {
      method: "POST",
      body: JSON.stringify({ room_id: publicRoom.id }),
    });
    const joinData = await joinRes.json().catch(() => ({}));
    if (!joinRes.ok) {
      throw new Error(joinData.message || "Failed to join public lobby");
    }

    const colyseusRoomId = joinData.colyseus_room_id;
    if (!colyseusRoomId) throw new Error("Missing colyseus_room_id from join response");

    window.localStorage.setItem(COLYSEUS_ROOM_ID_STORAGE_KEY, colyseusRoomId);
    window.location.href = CHARACTER_SELECT_PAGE;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setInlineError(publicErrorEl, message);
  } finally {
    publicConnectBtn.disabled = false;
    publicConnectSpinner.style.display = "none";
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
      type: "private",
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
try {
  if (!getToken()) {
    window.location.href = "/login.html";
    // stop execution after redirect
  } else {
    // Load private rooms when entering "Find Room"
    togglePrivatePanel("create");
    void loadPrivateRoomsAndRender();
  }
} catch {
  window.location.href = "/login.html";
}

