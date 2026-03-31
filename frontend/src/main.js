import { createGame } from "./game";

const AUTH_TOKEN_STORAGE_KEY = "supabase_access_token";

function hasAuthToken() {
  try {
    return typeof window !== "undefined" && !!window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return false;
  }
}

if (hasAuthToken()) {
  createGame();
} else {
  // Redirect to login page before Phaser bootstraps
  window.location.href = "/login.html";
}