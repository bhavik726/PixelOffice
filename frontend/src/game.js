import Phaser from "phaser";
import { Client, getStateCallbacks as _getStateCallbacks } from "colyseus.js";

const COLYSEUS_SERVER = "ws://127.0.0.1:4000";
const ROOM_NAME = "pixel-office";
const ROOM_ID_STORAGE_KEY = "pixel-office-room-id";

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

function updatePlayerPosition(sessionId, x, y) {
  playersMap.set(sessionId, { x, y });

  if (!room) return;

  if (sessionId === room.sessionId) return;

  let rect = playerRects.get(sessionId);

  if (!rect && gameScene) {
    rect = gameScene.add.rectangle(x, y, 40, 40, 0x3399ff);
    playerRects.set(sessionId, rect);
  }

  if (rect) {
    rect.x = x;
    rect.y = y;
  }
}

function removePlayer(sessionId) {
  playersMap.delete(sessionId);
  if (!room) return;

  if (sessionId === room.sessionId) {
    playerRects.delete(sessionId);
    return;
  }

  const rect = playerRects.get(sessionId);
  if (rect) rect.destroy();
  playerRects.delete(sessionId);
}

function updateDebugOverlay() {
  if (!debugText) return;

  const lines = [`Players: ${playersMap.size}`];
  playersMap.forEach((pos, sessionId) => {
    lines.push(`${sessionId.slice(0, 8)}: (${Math.round(pos.x)}, ${Math.round(pos.y)})`);
  });

  debugText.setText(lines.join("\n"));
}

function bindPlayerChange(statePlayer, sessionId) {
  // For Colyseus 0.15+ with @colyseus/schema, listen to individual fields
  if (typeof statePlayer.listen === "function") {
    statePlayer.listen("x", (newX) => {
      const pos = playersMap.get(sessionId) || { x: newX, y: 0 };
      pos.x = newX;
      playersMap.set(sessionId, pos);
      const rect = playerRects.get(sessionId);
      if (rect && sessionId !== room.sessionId) {
        rect.x = newX;
      }
      updateDebugOverlay();
    });
    statePlayer.listen("y", (newY) => {
      const pos = playersMap.get(sessionId) || { x: 0, y: newY };
      pos.y = newY;
      playersMap.set(sessionId, pos);
      const rect = playerRects.get(sessionId);
      if (rect && sessionId !== room.sessionId) {
        rect.y = newY;
      }
      updateDebugOverlay();
    });
    return;
  }

  // Fallback for older Colyseus
  statePlayer.onChange = () => {
    updatePlayerPosition(sessionId, statePlayer.x, statePlayer.y);
    updateDebugOverlay();
  };
}

function bindPlayerListeners() {
  if (!room?.state?.players || playersListenersBound) return;

  playersListenersBound = true;
  const statePlayers = hasStateCallbacks() ? _getStateCallbacks(room)(room.state).players : room.state.players;

  const onPlayerAdd = (statePlayer, sessionId) => {
    console.log("[onAdd] sessionId:", sessionId, "mine:", room.sessionId);
    updatePlayerPosition(sessionId, statePlayer.x, statePlayer.y);
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

  try {
    const client = new Client(COLYSEUS_SERVER);
    const availableRooms = await getAvailableRoomsCompat(client, ROOM_NAME);
    const targetRoom = availableRooms[0];

    if (targetRoom?.roomId) {
      room = await client.joinById(targetRoom.roomId);
    } else {
      room = await client.create(ROOM_NAME);
    }

    window.localStorage.setItem(ROOM_ID_STORAGE_KEY, room.roomId);
    console.log("✓ Connected to Colyseus room:", ROOM_NAME, room.roomId);

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
