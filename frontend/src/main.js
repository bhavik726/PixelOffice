import { createGame } from "./game";

const COLYSEUS_ROOM_ID_STORAGE_KEY = "colyseus_room_id";
const DISPLAY_NAME_STORAGE_KEY = "pixel_office_display_name";
const CHARACTER_KEY_STORAGE_KEY = "pixel_office_character_key";

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

if (hasRoomJoinSelection()) {
  createGame();
} else {
  // Start new sessions at room selection.
  window.location.href = "/lobby.html";
}