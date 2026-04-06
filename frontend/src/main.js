import { createGame } from "./game";

const AUTH_TOKEN_STORAGE_KEY = "supabase_access_token";
const COLYSEUS_ROOM_ID_STORAGE_KEY = "colyseus_room_id";
const DISPLAY_NAME_STORAGE_KEY = "pixel_office_display_name";
const CHARACTER_KEY_STORAGE_KEY = "pixel_office_character_key";

function hasAuthToken() {
  try {
    return typeof window !== "undefined" && !!window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return false;
  }
}

function hasRoomJoinSelection() {
  try {
    return (
      !!window.localStorage.getItem(COLYSEUS_ROOM_ID_STORAGE_KEY) &&
      !!window.localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) &&
      !!window.localStorage.getItem(CHARACTER_KEY_STORAGE_KEY)
    );
  } catch {
    return false;
  }
}

if (hasAuthToken()) {
  if (hasRoomJoinSelection()) {
    createGame();
  } else {
    window.location.href = "/lobby.html";
  }
} else {
  // Redirect to login page before Phaser bootstraps
  window.location.href = "/login.html";
}