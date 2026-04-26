const fs = require("fs");
const path = require("path");
// Use crypto for secure random session ID and CSRF token generation
const crypto = require("crypto");
// Use bcrypt to verify hashed passwords at login
const bcrypt = require("bcrypt");
const express = require("express");
const cookieParser = require("cookie-parser");
const { DEFAULT_DB_FILE, openDatabase } = require("../db");

function sendPublicFile(response, fileName) {
  response.sendFile(path.join(__dirname, "..", "public", fileName));
}

// Math.random() is not cryptographically secure; replaced with crypto.randomBytes
function createSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

// Generate a random CSRF token to be stored in the session and verified on requests
function createCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createApp() {
  if (!fs.existsSync(DEFAULT_DB_FILE)) {
    throw new Error(
      `Database file not found at ${DEFAULT_DB_FILE}. Run "npm run init-db" first.`
    );
  }

  const db = openDatabase(DEFAULT_DB_FILE);
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use("/css", express.static(path.join(__dirname, "..", "public", "css")));
  app.use("/js", express.static(path.join(__dirname, "..", "public", "js")));

  app.use(async (request, response, next) => {
    const sessionId = request.cookies.sid;

    if (!sessionId) {
      request.currentUser = null;
      next();
      return;
    }

    const row = await db.get(
      `
        SELECT
          sessions.id AS session_id,
          -- Read the CSRF token from the session row so it can be verified on requests
          sessions.csrf_token AS csrf_token,
          users.id AS id,
          users.username AS username,
          users.role AS role,
          users.display_name AS display_name
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = ?
      `,
      [sessionId]
    );

    request.currentUser = row
      ? {
          sessionId: row.session_id,
          // Expose csrfToken on the user object so requireCsrf can compare it
          csrfToken: row.csrf_token,
          id: row.id,
          username: row.username,
          role: row.role,
          displayName: row.display_name
        }
      : null;

    next();
  });

  function requireAuth(request, response, next) {
    if (!request.currentUser) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }

    next();
  }

  // Reject state-changing requests that do not supply a matching CSRF token header
  function requireCsrf(request, response, next) {
    if (!request.currentUser) { next(); return; }
    const token = request.headers["x-csrf-token"];
    if (!token || token !== request.currentUser.csrfToken) {
      response.status(403).json({ error: "Invalid or missing CSRF token." });
      return;
    }
    next();
  }

  app.get("/", (_request, response) => sendPublicFile(response, "index.html"));
  app.get("/login", (_request, response) => sendPublicFile(response, "login.html"));
  app.get("/notes", (_request, response) => sendPublicFile(response, "notes.html"));
  app.get("/settings", (_request, response) => sendPublicFile(response, "settings.html"));
  app.get("/admin", (_request, response) => sendPublicFile(response, "admin.html"));

  app.get("/api/me", (request, response) => {
    response.json({ user: request.currentUser });
  });

  app.post("/api/login", async (request, response) => {
    const username = String(request.body.username || "");
    const password = String(request.body.password || "");

    // Fetch by username only so we can verify the hash — never compare passwords in SQL
    const user = await db.get(
      `SELECT id, username, role, display_name, password
       FROM users WHERE username = ?`,
      [username]
    );

    // Use bcrypt.compare so the plaintext password is never used directly in a query
    if (!user || !(await bcrypt.compare(password, user.password))) {
      response.status(401).json({ error: "Invalid username or password." });
      return;
    }

    // Always generate a fresh session ID after login to prevent session fixation
    const sessionId = createSessionId();
    const csrfToken = createCsrfToken();

    await db.run("DELETE FROM sessions WHERE user_id = ?", [user.id]);
    // Store the CSRF token alongside the session so the server can verify it later
    await db.run(
      "INSERT INTO sessions (id, user_id, csrf_token, created_at) VALUES (?, ?, ?, ?)",
      [sessionId, user.id, csrfToken, new Date().toISOString()]
    );

    // httpOnly blocks JS from reading the cookie; sameSite blocks cross-site requests
    response.cookie("sid", sessionId, {
      httpOnly: true,
      sameSite: "strict",
      path: "/"
    });

    response.json({
      ok: true,
      // Return the CSRF token so the browser can attach it to future state-changing requests
      csrfToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name
      }
    });
  });

  app.post("/api/logout", async (request, response) => {
    if (request.cookies.sid) {
      await db.run("DELETE FROM sessions WHERE id = ?", [request.cookies.sid]);
    }

    response.clearCookie("sid");
    response.json({ ok: true });
  });

  app.get("/api/notes", requireAuth, async (request, response) => {
    // Derive ownerId from session; only admins may request another user's notes
    const user = request.currentUser;
    const search = String(request.query.search || "");
    const ownerId = (user.role === "admin" && request.query.ownerId)
      ? Number(request.query.ownerId)
      : user.id;

    // Parameterize ownerId and search so neither can be used to inject SQL
    const notes = await db.all(
      `SELECT
         notes.id,
         notes.owner_id AS ownerId,
         users.username AS ownerUsername,
         notes.title,
         notes.body,
         notes.pinned,
         notes.created_at AS createdAt
       FROM notes
       JOIN users ON users.id = notes.owner_id
       WHERE notes.owner_id = ?
         AND (notes.title LIKE ? OR notes.body LIKE ?)
       ORDER BY notes.pinned DESC, notes.id DESC`,
      [ownerId, `%${search}%`, `%${search}%`]
    );

    response.json({ notes });
  });

  // Added requireCsrf; ownerId now comes from the session so clients cannot spoof it
  app.post("/api/notes", requireAuth, requireCsrf, async (request, response) => {
    const ownerId = request.currentUser.id;
    const title = String(request.body.title || "");
    const body = String(request.body.body || "");
    const pinned = request.body.pinned ? 1 : 0;

    const result = await db.run(
      "INSERT INTO notes (owner_id, title, body, pinned, created_at) VALUES (?, ?, ?, ?, ?)",
      [ownerId, title, body, pinned, new Date().toISOString()]
    );

    response.status(201).json({
      ok: true,
      noteId: result.lastID
    });
  });

  app.get("/api/settings", requireAuth, async (request, response) => {
    // Derive userId from session; only admins may request another user's settings
    const user = request.currentUser;
    const userId = (user.role === "admin" && request.query.userId)
      ? Number(request.query.userId)
      : user.id;

    const settings = await db.get(
      `
        SELECT
          users.id AS userId,
          users.username,
          users.role,
          users.display_name AS displayName,
          settings.status_message AS statusMessage,
          settings.theme,
          settings.email_opt_in AS emailOptIn
        FROM settings
        JOIN users ON users.id = settings.user_id
        WHERE settings.user_id = ?
      `,
      [userId]
    );

    response.json({ settings });
  });

  // Added requireCsrf; userId now comes from the session so clients cannot target other users
  app.post("/api/settings", requireAuth, requireCsrf, async (request, response) => {
    const user = request.currentUser;
    const userId = (user.role === "admin" && request.body.userId)
      ? Number(request.body.userId)
      : user.id;
    const displayName = String(request.body.displayName || "");
    const statusMessage = String(request.body.statusMessage || "");
    const theme = String(request.body.theme || "classic");
    const emailOptIn = request.body.emailOptIn ? 1 : 0;

    await db.run("UPDATE users SET display_name = ? WHERE id = ?", [displayName, userId]);
    await db.run(
      "UPDATE settings SET status_message = ?, theme = ?, email_opt_in = ? WHERE user_id = ?",
      [statusMessage, theme, emailOptIn, userId]
    );

    response.json({ ok: true });
  });

  // Changed from GET to POST so a side-effect request cannot be triggered by a plain link or image tag
  app.post("/api/settings/toggle-email", requireAuth, requireCsrf, async (request, response) => {
    const enabled = request.body.enabled === "1" ? 1 : 0;

    await db.run("UPDATE settings SET email_opt_in = ? WHERE user_id = ?", [
      enabled,
      request.currentUser.id
    ]);

    response.json({
      ok: true,
      userId: request.currentUser.id,
      emailOptIn: enabled
    });
  });

  // Added explicit role check so non-admin users cannot access the user directory
  app.get("/api/admin/users", requireAuth, async (request, response) => {
    if (request.currentUser.role !== "admin") {
      response.status(403).json({ error: "Forbidden." });
      return;
    }

    const users = await db.all(`
      SELECT
        users.id,
        users.username,
        users.role,
        users.display_name AS displayName,
        COUNT(notes.id) AS noteCount
      FROM users
      LEFT JOIN notes ON notes.owner_id = users.id
      GROUP BY users.id, users.username, users.role, users.display_name
      ORDER BY users.id
    `);

    response.json({ users });
  });

  return app;
}

module.exports = {
  createApp
};
