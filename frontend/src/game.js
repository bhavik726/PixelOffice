import Phaser from "phaser";
import { Client, getStateCallbacks as _getStateCallbacks } from "colyseus.js";

const COLYSEUS_SERVER = "ws://127.0.0.1:4000";
const ROOM_NAME = "pixel-office";
const AUTH_TOKEN_STORAGE_KEY = "supabase_access_token";
const COLYSEUS_ROOM_ID_STORAGE_KEY = "colyseus_room_id";

function getHttpBaseFromWs(wsUrl) {
  // ws://host:port -> http://host:port ; wss:// -> https://
  return wsUrl.replace(/^ws(s?):\/\//, "http$1://");
}

async function getAvailableRoomsCompat(client, roomName) {
  if (typeof client.getAvailableRooms === "function") {
    return await client.getAvailableRooms(roomName);
  }

  // Fallback for older colyseus.js builds: call matchmake HTTP endpoint directly.
  const httpBase = getHttpBaseFromWs(COLYSEUS_SERVER);
  const res = await fetch(`${httpBase}/matchmake/rooms/${encodeURIComponent(roomName)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch available rooms (${res.status})`);
  }
  return await res.json();
}

function hasStateCallbacks() {
  return typeof _getStateCallbacks === "function";
}

export function createGame() {
  const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: "#1a1a1a",
    scene: {
      preload,
      create,
      update,
    },
  };

  new Phaser.Game(config);
}

let player;
let room;
let cursors;
let gameScene;
let debugText;
let playersListenersBound = false;

const playersMap = new Map();
const playerRects = new Map();
const nameTexts = new Map();

function updatePlayerPosition(sessionId, x, y, username, userId) {
  const existing = playersMap.get(sessionId) || {};
  playersMap.set(sessionId, {
    x,
    y,
    username: username ?? existing.username,
    userId: userId ?? existing.userId,
  });

  if (!room) return;

  const isLocal = sessionId === room.sessionId;

  let rect = playerRects.get(sessionId);
  let nameText = nameTexts.get(sessionId);

  if (!rect && gameScene) {
    rect = isLocal
      ? player
      : gameScene.add.rectangle(x, y, 40, 40, 0x3399ff);
    playerRects.set(sessionId, rect);
  }

  const label = username || userId || sessionId.slice(0, 8);

  if (!nameText && gameScene) {
    nameText = gameScene.add.text(x, y - 30, label, {
      color: "#ffffff",
      fontSize: "12px",
    });
    nameText.setOrigin(0.5, 1);
    nameTexts.set(sessionId, nameText);
  } else if (nameText) {
    nameText.setText(label);
  }

  if (rect) {
    rect.x = x;
    rect.y = y;
  }
  if (nameText) {
    nameText.x = x;
    nameText.y = y - 30;
  }
}

function removePlayer(sessionId) {
  playersMap.delete(sessionId);
  if (!room) return;

  if (sessionId === room.sessionId) {
    playerRects.delete(sessionId);
    const nameText = nameTexts.get(sessionId);
    if (nameText) nameText.destroy();
    nameTexts.delete(sessionId);
    return;
  }

  const rect = playerRects.get(sessionId);
  if (rect) rect.destroy();
  playerRects.delete(sessionId);

  const nameText = nameTexts.get(sessionId);
  if (nameText) nameText.destroy();
  nameTexts.delete(sessionId);
}

function updateDebugOverlay() {
  if (!debugText) return;

  const lines = [`Players: ${playersMap.size}`];
  playersMap.forEach((pos, sessionId) => {
    lines.push(
      `${pos.username || sessionId.slice(0, 8)} (${sessionId.slice(
        0,
        8,
      )}): (${Math.round(pos.x)}, ${Math.round(pos.y)})`,
    );
  });

  debugText.setText(lines.join("\n"));
}

function bindPlayerChange(statePlayer, sessionId) {
  // For Colyseus 0.15+ with @colyseus/schema, listen to individual fields
  if (typeof statePlayer.listen === "function") {
    statePlayer.listen("x", (newX) => {
      const current = playersMap.get(sessionId) || {};
      updatePlayerPosition(
        sessionId,
        newX,
        current.y ?? 0,
        current.username,
        current.userId,
      );
      updateDebugOverlay();
    });
    statePlayer.listen("y", (newY) => {
      const current = playersMap.get(sessionId) || {};
      updatePlayerPosition(
        sessionId,
        current.x ?? 0,
        newY,
        current.username,
        current.userId,
      );
      updateDebugOverlay();
    });
    statePlayer.listen("username", (newUsername) => {
      const current = playersMap.get(sessionId) || {};
      updatePlayerPosition(
        sessionId,
        current.x ?? 0,
        current.y ?? 0,
        newUsername,
        current.userId,
      );
      updateDebugOverlay();
    });
    return;
  }

  // Fallback for older Colyseus
  statePlayer.onChange = () => {
    updatePlayerPosition(
      sessionId,
      statePlayer.x,
      statePlayer.y,
      statePlayer.username || statePlayer.name,
      statePlayer.userId,
    );
    updateDebugOverlay();
  };
}

function bindPlayerListeners() {
  if (!room?.state?.players || playersListenersBound) return;

  playersListenersBound = true;
  const statePlayers = hasStateCallbacks() ? _getStateCallbacks(room)(room.state).players : room.state.players;

  const onPlayerAdd = (statePlayer, sessionId) => {
    console.log("[onAdd] sessionId:", sessionId, "mine:", room.sessionId);
    updatePlayerPosition(
      sessionId,
      statePlayer.x,
      statePlayer.y,
      statePlayer.username || statePlayer.name,
      statePlayer.userId,
    );
    bindPlayerChange(statePlayer, sessionId);
    updateDebugOverlay();
  };

  const onPlayerRemove = (_, sessionId) => {
    removePlayer(sessionId);
    updateDebugOverlay();
  };

  if (typeof statePlayers.onAdd === "function") {
    // getStateCallbacks() wrapper style
    statePlayers.onAdd(onPlayerAdd);
    statePlayers.onRemove(onPlayerRemove);
  } else {
    // MapSchema direct properties style
    statePlayers.onAdd = onPlayerAdd;
    statePlayers.onRemove = onPlayerRemove;
  }

  // Fallback: catch any players that already existed before listeners were attached.
  statePlayers.forEach((statePlayer, sessionId) => {
    updatePlayerPosition(sessionId, statePlayer.x, statePlayer.y);
    bindPlayerChange(statePlayer, sessionId);
  });

  updateDebugOverlay();
}

async function preload() {}

async function create() {
  gameScene = this;
  player = this.add.rectangle(400, 300, 40, 40, 0x00ff00);
  cursors = this.input.keyboard.createCursorKeys();
  debugText = this.add.text(12, 12, "Connecting...", {
    color: "#ffffff",
    fontSize: "14px",
  });

  // Simple logout button pinned to top-right
  const logoutText = this.add
    .text(780, 20, "Logout", {
      color: "#9ca3af",
      fontSize: "12px",
      backgroundColor: "rgba(15,23,42,0.6)",
      padding: { left: 8, right: 8, top: 4, bottom: 4 },
    })
    .setOrigin(1, 0.5)
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true });

  logoutText.on("pointerover", () => {
    logoutText.setColor("#ffffff");
  });
  logoutText.on("pointerout", () => {
    logoutText.setColor("#9ca3af");
  });
  logoutText.on("pointerup", () => {
    try {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    window.location.href = "/login.html";
  });

  try {
    const client = new Client(COLYSEUS_SERVER);
    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) {
      console.error("No auth token found. Redirecting to /login");
      window.location.href = "/login.html";
      return;
    }

    const colyseusRoomId = window.localStorage.getItem(COLYSEUS_ROOM_ID_STORAGE_KEY);
    if (!colyseusRoomId) {
      window.location.href = "/lobby.html";
      return;
    }

    // Join the exact Colyseus room id chosen on the lobby page
    room = await client.joinById(colyseusRoomId, { token });
    console.log("✓ Connected to Colyseus room:", colyseusRoomId);

    room.onStateChange((state) => {
      if (!state?.players) return;

      // Only bind once after first state patch.
      if (!playersListenersBound) {
        bindPlayerListeners();
      }

      updateDebugOverlay();

      console.log("State updated", {
        roomId: room.roomId,
        you: room.sessionId,
        playerCount: playersMap.size,
      });
    });
  } catch (error) {
    console.error("Failed to connect to Colyseus:", error);
    // Handle invalid / expired token
    if (error && typeof error === "object" && "message" in error) {
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("token")) {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        window.location.href = "/login.html";
      }
    }
  }
}

function update() {
  const isMoving =
    cursors.left.isDown || cursors.right.isDown || cursors.up.isDown || cursors.down.isDown;

  // Local movement for immediate feedback
  if (cursors.left.isDown) player.x -= 3;
  if (cursors.right.isDown) player.x += 3;
  if (cursors.up.isDown) player.y -= 3;
  if (cursors.down.isDown) player.y += 3;

  // Send movement to backend with absolute coordinates
  if (isMoving && room) {
    room.send("move", { x: Math.round(player.x), y: Math.round(player.y) });
  }
}
