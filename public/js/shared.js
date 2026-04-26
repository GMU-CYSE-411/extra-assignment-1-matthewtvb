// Removed the ?sid= session fixation helper that let an attacker pre-plant a known session ID
let _csrfToken = null;

async function api(path, options = {}) {
  // Attach the CSRF token header on every state-changing request
  const method = (options.method || "GET").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (_csrfToken && method !== "GET" && method !== "HEAD") {
    headers["X-CSRF-Token"] = _csrfToken;
  }

  const response = await fetch(path, {
    headers,
    credentials: "same-origin",
    ...options
  });

  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof body === "object" && body && body.error ? body.error : response.statusText;
    throw new Error(message);
  }

  return body;
}

async function loadCurrentUser() {
  const data = await api("/api/me");
  // Capture the CSRF token from the session so it can be sent on future requests
  if (data.user && data.user.csrfToken) {
    _csrfToken = data.user.csrfToken;
  }
  return data.user;
}

function writeJson(elementId, value) {
  const target = document.getElementById(elementId);
  if (target) {
    target.textContent = JSON.stringify(value, null, 2);
  }
}

// Expose setter so login.js can store the token returned at login
function setCsrfToken(token) {
  _csrfToken = token;
}
