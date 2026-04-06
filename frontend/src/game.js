import Phaser from "phaser";
import { Client, getStateCallbacks as _getStateCallbacks } from "colyseus.js";
import GameConfig from "./game/config";
import ChatOverlay from "./game/chat/chatOverlay";

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  "http://127.0.0.1:4000";

const COLYSEUS_SERVER =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_COLYSEUS_URL) ||
  API_BASE_URL.replace(/^http/i, (m) => (m.toLowerCase() === "https" ? "wss" : "ws"));
const ROOM_NAME = "pixel-office";
const AUTH_TOKEN_STORAGE_KEY = "supabase_access_token";
const COLYSEUS_ROOM_ID_STORAGE_KEY = "colyseus_room_id";
const DISPLAY_NAME_STORAGE_KEY = "pixel_office_display_name";
const CHARACTER_KEY_STORAGE_KEY = "pixel_office_character_key";

function getHttpBaseFromWs(wsUrl) {
  return wsUrl.replace(/^ws(s?):\/\//, "http$1://");
}

async function getAvailableRoomsCompat(client, roomName) {
  if (typeof client.getAvailableRooms === "function") {
    return await client.getAvailableRooms(roomName);
  }

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

function getStoredValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function createGame() {
  // Create the Phaser game instance
  const game = new Phaser.Game(GameConfig);
  
  // Wait for the scene to be fully initialized
  await new Promise((resolve) => {
    const checkScene = () => {
      const scene = game.scene.getScene('MainScene');
      if (scene && scene.sys && scene.sys.isActive()) {
        resolve(scene);
      } else {
        setTimeout(checkScene, 50);
      }
    };
    checkScene();
  });
  
  // Get the MainScene instance after it's ready
  const scene = game.scene.getScene('MainScene');
  
  if (!scene) {
    console.error('MainScene not found!');
    return;
  }
  
  try {
    // Setup Colyseus connection
    const client = new Client(COLYSEUS_SERVER);
    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) {
      console.error("No auth token found. Redirecting to /login");
      window.location.href = "/login.html";
      return;
    }

    const colyseusRoomId = window.localStorage.getItem(COLYSEUS_ROOM_ID_STORAGE_KEY);
    if (!colyseusRoomId) {
      console.warn("No room ID found. Redirecting to /lobby.html");
      window.location.href = "/lobby.html";
      return;
    }

    const displayName = getStoredValue(DISPLAY_NAME_STORAGE_KEY);
    const characterKey = getStoredValue(CHARACTER_KEY_STORAGE_KEY);

    if (!displayName || !characterKey) {
      console.warn("Missing character selection. Redirecting to character selection.");
      window.location.href = "/select-character.html";
      return;
    }

    console.log("Attempting to join room:", colyseusRoomId);
    
    // Join the Colyseus room
    let room;
    try {
      room = await client.joinById(colyseusRoomId, {
        token,
        displayName,
        characterKey,
      });
      console.log("✓ Connected to Colyseus room:", colyseusRoomId);
    } catch (roomError) {
      console.error("Failed to join room:", roomError);
      console.log("Room may have been closed. Redirecting to lobby...");
      window.localStorage.removeItem(COLYSEUS_ROOM_ID_STORAGE_KEY);
      window.location.href = "/lobby.html";
      return;
    }
    
    // Bind the room to the scene
    if (!room) {
      console.error("Room connection failed - room is undefined");
      return;
    }
    
    scene.room = room;

    scene.chatOverlay = new ChatOverlay(scene);
    scene.chatOverlay.bindRoom(room);
    
    // Bind player state listeners
    bindPlayerListeners(scene);
    
    // Listen for state changes
    room.onStateChange((state) => {
      if (!state?.players) return;
      
      // Update debug overlay with every state change
      scene.updateDebugOverlay();
      
      console.log("State updated", {
        roomId: room.roomId,
        you: room.sessionId,
        playerCount: scene.playersMap.size,
      });
    });
    
    console.log("✓ Colyseus setup complete");
    
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

/**
 * Bind player state change listeners (Colyseus)
 */
function bindPlayerListeners(scene) {
  // Check if room and state exist
  if (!scene?.room || !scene.room.state) {
    console.warn("Room or state not ready for player listeners");
    return;
  }

  if (!scene.room.state.players) {
    console.warn("Players collection not ready");
    return;
  }

  const statePlayers = hasStateCallbacks() 
    ? _getStateCallbacks(scene.room)(scene.room.state).players 
    : scene.room.state.players;

  if (!statePlayers) {
    console.warn("Could not get statePlayers");
    return;
  }

  const onPlayerAdd = (statePlayer, sessionId) => {
    if (!scene.room) {
      console.warn("Room not available in onPlayerAdd");
      return;
    }
    console.log("[onAdd] sessionId:", sessionId, "mine:", scene.room.sessionId);
    scene.updatePlayerPosition(
      sessionId,
      statePlayer.x,
      statePlayer.y,
      statePlayer.username || statePlayer.name,
      statePlayer.userId,
      statePlayer.characterKey,
      statePlayer.avatarId,
      statePlayer.direction,
      statePlayer.isMoving,
      statePlayer.isSitting,
    );
    scene.bindPlayerChange(statePlayer, sessionId);
    scene.updateDebugOverlay();
  };

  const onPlayerRemove = (_, sessionId) => {
    scene.removePlayer(sessionId);
    scene.updateDebugOverlay();
  };

  if (typeof statePlayers.onAdd === "function") {
    statePlayers.onAdd(onPlayerAdd);
    statePlayers.onRemove(onPlayerRemove);
  } else {
    statePlayers.onAdd = onPlayerAdd;
    statePlayers.onRemove = onPlayerRemove;
  }

  // Catch players that already exist
  console.log("Checking existing players...");
  statePlayers.forEach((statePlayer, sessionId) => {
    console.log("Existing player:", sessionId);
    scene.updatePlayerPosition(
      sessionId, 
      statePlayer.x, 
      statePlayer.y,
      statePlayer.username || statePlayer.name,
      statePlayer.userId,
      statePlayer.characterKey,
      statePlayer.avatarId,
      statePlayer.direction,
      statePlayer.isMoving,
      statePlayer.isSitting,
    );
    scene.bindPlayerChange(statePlayer, sessionId);
  });

  console.log("Player listeners bound successfully");
  scene.updateDebugOverlay();
}
