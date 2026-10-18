const express = require("express");
const path = require("path");
require("dotenv").config();

const pool = require("./db");
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, NOW() AS server_time"
    );

    res.json({
      status: "connected",
      service: "INDEX Database",
      database: result.rows[0].database,
      serverTime: result.rows[0].server_time
    });
  } catch (error) {
    console.error("Health check failed:", error.message);
    res.status(500).json({ status: "error", message: "Database unavailable." });
  }
});

app.post("/api/setup", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS index_demo_users (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS index_projects (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    res.json({
      success: true,
      message: "INDEX Database tables are ready."
    });
  } catch (error) {
    console.error("Setup failed:", error.message);
    res.status(500).json({ success: false, message: "Database setup failed." });
  }
});

// Create a project.
app.post("/api/projects", async (req, res) => {
  const { name } = req.body || {};

  if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
    return res.status(400).json({
      error: "Project name must be between 1 and 80 characters."
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO index_projects (name)
       VALUES ($1)
       RETURNING id, name, created_at`,
      [name.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Project creation failed:", error.message);
    res.status(500).json({ error: "Could not create the project." });
  }
});

// List projects.
app.get("/api/projects", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, created_at
       FROM index_projects
       ORDER BY id DESC
       LIMIT 100`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Project listing failed:", error.message);
    res.status(500).json({ error: "Could not load projects. Run /api/setup first." });
  }
});

// Existing test-user endpoints.
app.post("/api/users", async (req, res) => {
  const { username } = req.body || {};

  if (
    typeof username !== "string" ||
    !username.trim() ||
    username.trim().length > 100
  ) {
    return res.status(400).json({
      error: "Enter a username between 1 and 100 characters."
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO index_demo_users (username)
       VALUES ($1)
       RETURNING id, username, created_at`,
      [username.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("User creation failed:", error.message);
    res.status(500).json({ error: "Could not save the user. Run /api/setup first." });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, created_at
       FROM index_demo_users
       ORDER BY id DESC
       LIMIT 100`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("User retrieval failed:", error.message);
    res.status(500).json({ error: "Could not retrieve users. Run /api/setup first." });
  }
});

app.listen(PORT, () => {
  console.log(`INDEX Database running at http://localhost:${PORT}`);
});