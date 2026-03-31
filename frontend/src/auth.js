const AUTH_TOKEN_STORAGE_KEY = "supabase_access_token";
const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  "http://127.0.0.1:4000";

const tabsEl = document.getElementById("auth-tabs");
const formEl = document.getElementById("auth-form");
const usernameFieldWrapper = formEl.querySelector('[data-field="username"]');
const submitBtn = document.getElementById("auth-submit");
const submitLabel = document.getElementById("auth-submit-label");
const errorEl = document.getElementById("auth-error");
const successEl = document.getElementById("auth-success");

let mode = "login"; // "login" | "signup"

function setMode(next) {
  mode = next;

  // Toggle active tab
  tabsEl.querySelectorAll(".tab").forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.dataset.active = isActive ? "true" : "false";
  });

  // Show/hide username field
  usernameFieldWrapper.style.display = mode === "signup" ? "flex" : "none";

  // Clear messages
  errorEl.style.display = "none";
  errorEl.textContent = "";
  successEl.style.display = "none";
  successEl.textContent = "";

  // Adjust submit label
  submitLabel.textContent = mode === "login" ? "Continue" : "Create account";
}

tabsEl.addEventListener("click", (event) => {
  const btn = event.target.closest(".tab");
  if (!btn) return;
  setMode(btn.dataset.mode === "signup" ? "signup" : "login");
});

function setLoading(isLoading) {
  submitBtn.dataset.loading = isLoading ? "true" : "false";
  submitBtn.disabled = isLoading;
  if (isLoading) {
    if (!submitBtn.querySelector(".spinner")) {
      const spinner = document.createElement("span");
      spinner.className = "spinner";
      submitBtn.insertBefore(spinner, submitLabel);
    }
  } else {
    const spinner = submitBtn.querySelector(".spinner");
    if (spinner) spinner.remove();
  }
}

async function handleLogin({ email, password }) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "Login failed");
  }

  const token = data.access_token;
  if (!token) {
    throw new Error("Login response missing access_token");
  }

  try {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore storage failure; user just won't stay logged in
  }

  // Redirect to lobby (user chooses a room)
  window.location.href = "/lobby.html";
}

async function handleSignup({ email, password, username }) {
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, username }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "Signup failed");
  }

  // Backend currently returns raw Supabase data, not access_token.
  // We guide the user to log in.
  successEl.style.display = "block";
  successEl.textContent =
    "Signup successful. Check your email (if confirmation is enabled), then log in.";
  errorEl.style.display = "none";
  errorEl.textContent = "";

  // Switch back to login tab after a short delay
  setTimeout(() => setMode("login"), 800);
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.style.display = "none";
  successEl.style.display = "none";
  errorEl.textContent = "";
  successEl.textContent = "";

  const formData = new FormData(formEl);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const username = String(formData.get("username") || "").trim();

  if (!email || !password || (mode === "signup" && !username)) {
    errorEl.style.display = "block";
    errorEl.textContent = "Please fill in all required fields.";
    return;
  }

  try {
    setLoading(true);
    if (mode === "login") {
      await handleLogin({ email, password });
    } else {
      await handleSignup({ email, password, username });
    }
  } catch (err) {
    errorEl.style.display = "block";
    errorEl.textContent =
      err instanceof Error ? err.message : "Something went wrong. Please try again.";
  } finally {
    setLoading(false);
  }
});

// If the user is already authenticated, send them straight to the game.
try {
  if (window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) {
    window.location.href = "/lobby.html";
  }
} catch {
  // ignore
}

