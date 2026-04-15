import Phaser from "phaser";
import { Client, getStateCallbacks as _getStateCallbacks } from "colyseus.js";
import GameConfig from "./game/config";
import ChatOverlay from "./game/chat/chatOverlay";
import { MediaControls } from "./game/webrtc/MediaControls";
import { PeerManager } from "./game/webrtc/PeerManager";
import { ProximityManager } from "./game/webrtc/ProximityManager";
import { VideoOverlay } from "./game/webrtc/VideoOverlay";
import { ComputerZoneManager } from "./game/webrtc/computerZone/ComputerZoneManager";

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  "http://127.0.0.1:4000";

const COLYSEUS_SERVER =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_COLYSEUS_URL) ||
  API_BASE_URL.replace(/^http/i, (m) => (m.toLowerCase() === "https" ? "wss" : "ws"));
const ROOM_NAME = "pixel-office";
const COLYSEUS_ROOM_ID_STORAGE_KEY = "colyseus_room_id";
const GUEST_ID_STORAGE_KEY = "pixel_office_guest_id";
const DISPLAY_NAME_STORAGE_KEY = "pixel_office_display_name";
const CHARACTER_KEY_STORAGE_KEY = "pixel_office_character_key";
const NETWORK_DIAG_STORAGE_KEY = "pixel_office_net_diag";

function isNetworkDiagnosticsEnabled() {
  const envEnabled =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_NETWORK_DIAGNOSTICS === "1";

  let queryEnabled = false;
  try {
    const params = new URLSearchParams(window.location.search);
    queryEnabled =
      params.get("netDiag") === "1" ||
      params.get("diag") === "1" ||
      params.get("networkDebug") === "1";
  } catch {
    queryEnabled = false;
  }

  const storageEnabled = getStoredValue(NETWORK_DIAG_STORAGE_KEY) === "1";
  return Boolean(envEnabled || queryEnabled || storageEnabled);
}

function snapshotPlayers(playersState) {
  const players = {};

  if (!playersState || typeof playersState.forEach !== "function") {
    return players;
  }

  playersState.forEach((player, sessionId) => {
    players[sessionId] = {
      x: Number(player?.x ?? 0),
      y: Number(player?.y ?? 0),
      direction: player?.direction,
      isMoving: Boolean(player?.isMoving),
      isSitting: Boolean(player?.isSitting),
    };
  });

  return players;
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

function ensureGuestId() {
  const existing = getStoredValue(GUEST_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  try {
    window.localStorage.setItem(GUEST_ID_STORAGE_KEY, generated);
  } catch {
    // ignore storage failures
  }

  return generated;
}

export async function createGame() {
  // Create the Phaser game instance
  const game = new Phaser.Game(GameConfig);
  const networkDiagnosticsEnabled = isNetworkDiagnosticsEnabled();
  
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
    const guestId = ensureGuestId();

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

    // Join the Colyseus room
    let room;
    try {
      room = await client.joinById(colyseusRoomId, {
        guestId,
        displayName,
        characterKey,
      });
    } catch (roomError) {
      console.error("Failed to join room:", roomError);
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
    room.onMessage('computer-zone-state', () => {});

    scene.chatOverlay = new ChatOverlay(scene);
    scene.chatOverlay.bindRoom(room);

    const mediaControls = new MediaControls();
    let videoOverlay = null;
    let peerManager = null;
    let proximityManager = null;
    let computerZoneManager = null;
    let mediaBootstrapCleanup = null;

    const syncLiveMedia = (emitState = true) => {
      const stream = mediaControls.getStream();
      if (!(stream instanceof MediaStream)) {
        return false;
      }

      peerManager?.setLocalStream?.(stream);
      videoOverlay?.setLocalStream?.(stream);
      if (emitState) {
        videoOverlay?.emitLocalMediaState?.();
      }

      return true;
    };

    const setupLazyMediaBootstrap = () => {
      if (mediaBootstrapCleanup || mediaControls.getStream()) {
        return;
      }

      const handler = async () => {
        if (mediaControls.getStream()) {
          mediaBootstrapCleanup?.();
          return;
        }

        const granted = await mediaControls.getUserMedia(true);
        if (!granted) {
          return;
        }

        syncLiveMedia(true);
        proximityManager?.tick?.();
        mediaBootstrapCleanup?.();
      };

      const events = ["pointerdown", "touchstart", "keydown"];
      events.forEach((eventName) => {
        window.addEventListener(eventName, handler, { passive: true });
      });

      mediaBootstrapCleanup = () => {
        events.forEach((eventName) => {
          window.removeEventListener(eventName, handler);
        });
        mediaBootstrapCleanup = null;
      };
    };

    let pingLogIntervalId = null;
    const cleanupWebRTC = () => {
      mediaBootstrapCleanup?.();
      if (pingLogIntervalId !== null) {
        window.clearInterval(pingLogIntervalId);
        pingLogIntervalId = null;
      }
      computerZoneManager?.destroy?.();
      proximityManager?.destroy?.();
      peerManager?.destroy?.();
      mediaControls.destroy();
      videoOverlay?.destroy?.();

      proximityManager = null;
      peerManager = null;
      videoOverlay = null;
      scene.videoOverlay = null;
    };

    const mediaReady = await mediaControls.init();

    if (!mediaReady || !mediaControls.getStream()) {
      console.error('[game.js] CRITICAL: WebRTC media stream not available - proximity voice/video disabled');
      videoOverlay = new VideoOverlay(mediaControls, {
        scene,
        localProfile: {
          name: displayName || 'You',
          characterKey,
        },
        onMediaStateChange: ({ videoEnabled, audioEnabled }) => {
          room?.send?.('media-state', { videoEnabled, audioEnabled });
        },
      });
      // Continue with null stream - ProximityManager should be disabled
    } else {
      videoOverlay = new VideoOverlay(mediaControls, {
        scene,
        localProfile: {
          name: displayName || 'You',
          characterKey,
        },
        onMediaStateChange: ({ videoEnabled, audioEnabled }) => {
          room?.send?.('media-state', { videoEnabled, audioEnabled });
        },
      });
      videoOverlay.setLocalStream(mediaControls.getStream());
      videoOverlay.emitLocalMediaState?.();
    }

    scene.videoOverlay = videoOverlay;

    if (!mediaControls.getStream()) {
      setupLazyMediaBootstrap();
    }

    room.onMessage('media-state', (payload) => {
      if (!payload?.sessionId) {
        return;
      }

      videoOverlay?.updateRemoteMediaState?.(payload.sessionId, {
        videoEnabled: payload.videoEnabled,
        audioEnabled: payload.audioEnabled,
      });
    });

    peerManager = new PeerManager(room, mediaControls.getStream(), videoOverlay, mediaControls);
    await peerManager.init();
    syncLiveMedia(true);

    proximityManager = new ProximityManager(scene, peerManager);
    proximityManager.start();

    computerZoneManager = new ComputerZoneManager({
      room,
      scene,
      proximityManager,
      mediaControls,
    });
    scene.computerZoneManager = computerZoneManager;

    const originalLeaveRoom = typeof scene.leaveRoom === "function" ? scene.leaveRoom.bind(scene) : null;
    scene.leaveRoom = async (...args) => {
      cleanupWebRTC();
      if (originalLeaveRoom) {
        return await originalLeaveRoom(...args);
      }
      return undefined;
    };

    scene.events.once("shutdown", cleanupWebRTC);
    scene.events.once("destroy", cleanupWebRTC);

    if (networkDiagnosticsEnabled) {
      console.info("[DIAG] Network diagnostics enabled");
      if (typeof scene.setNetworkDiagnostics === "function") {
        scene.setNetworkDiagnostics(true);
      }
      pingLogIntervalId = window.setInterval(() => {
        console.log("[DIAG][connection]", {
          ts: Date.now(),
          ping: room?.connection?.ping ?? null,
        });
      }, 2000);
    }

    
    // Bind player state listeners
    bindPlayerListeners(scene);
    
    // Listen for state changes
    let lastStateChangeAt = 0;
    room.onStateChange((state) => {
      if (!state?.players) return;

      if (networkDiagnosticsEnabled) {
        const now = Date.now();
        const deltaMs = lastStateChangeAt > 0 ? now - lastStateChangeAt : null;
        lastStateChangeAt = now;
        const snapshot = snapshotPlayers(state.players);

        console.log("[DIAG][state-change]", {
          ts: now,
          deltaMs,
          playerCount: Object.keys(snapshot).length,
          players: snapshot,
        });

        // Explicit raw Colyseus state logging for backend vs frontend diagnosis.
        console.log("[DIAG][state.players-raw]", state.players);
      }
      
      // Update debug overlay with every state change
      scene.updateDebugOverlay();
    });
    
  } catch (error) {
    console.error("Failed to connect to Colyseus:", error);
    window.location.href = "/lobby.html";
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
  statePlayers.forEach((statePlayer, sessionId) => {
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
  scene.updateDebugOverlay();
}
