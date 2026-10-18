const express = require("express");
const path = require("path");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const pool = require("./db");
const app = express();
const PORT = process.env.PORT || 3001;

// =====================================================
// API RATE LIMITING
// =====================================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please try again later."
  }
});

// =====================================================
// BASIC MIDDLEWARE
// =====================================================

app.use(express.json({ limit: "10kb" }));

app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.url);
  next();
});

// Rate limit API requests before authentication.
app.use("/api", apiLimiter);

// =====================================================
// PUBLIC HEALTH CHECK — SERVICE STATUS ONLY
// Must be before API authentication middleware.
// =====================================================

app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "INDEX Database",
    status: "running"
  });
});

// =====================================================
// CONFIGURATION
// =====================================================

const API_KEY = process.env.API_KEY;

if (typeof API_KEY !== "string" || API_KEY.length < 32) {
  throw new Error("API_KEY is missing or too short. Check .env.");
}

const ALLOWED_COLUMN_TYPES = {
  text: "TEXT",
  integer: "INTEGER",
  boolean: "BOOLEAN",
  date: "DATE",
  timestamp: "TIMESTAMPTZ"
};

function hashApiKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function isValidIdentifier(value) {
  return (
    typeof value === "string" &&
    /^[a-z][a-z0-9_]{0,62}$/.test(value)
  );
}

function isValidId(value) {
  return (
    typeof value === "string" &&
    /^[1-9]\d*$/.test(value)
  );
}

function requireMaster(req, res, next) {
  if (!req.auth?.isMaster) {
    return res.status(403).json({
      success: false,
      error: "Master API key required."
    });
  }

  next();
}

// =====================================================
// AUTHENTICATION
// Master key: administrative access
// User key: assigned project access only
// =====================================================

app.use("/api", async (req, res, next) => {
  const providedKey = req.get("x-api-key");

  if (
    typeof providedKey !== "string" ||
    providedKey.length > 256
  ) {
    return res.status(401).json({
      success: false,
      error: "A valid API key is required."
    });
  }

  const providedBuffer = Buffer.from(providedKey, "utf8");
  const masterBuffer = Buffer.from(API_KEY, "utf8");

  if (
    providedBuffer.length === masterBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, masterBuffer)
  ) {
    req.auth = { isMaster: true };
    return next();
  }

  try {
    const result = await pool.query(
      `SELECT id, user_id
       FROM public.index_api_keys
       WHERE key_hash = $1
         AND is_active = TRUE
         AND revoked_at IS NULL`,
      [hashApiKey(providedKey)]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid or revoked API key."
      });
    }

    const apiKey = result.rows[0];

    req.auth = {
      isMaster: false,
      keyId: apiKey.id,
      userId: apiKey.user_id
    };

    const isProjectList =
      req.method === "GET" && req.path === "/projects";

    const isIndividualProject =
      /^\/projects\/[1-9]\d*(?:\/|$)/.test(req.path);

    if (!isProjectList && !isIndividualProject) {
      return res.status(403).json({
        success: false,
        error: "This API key cannot access administrative endpoints."
      });
    }

    await pool.query(
      `UPDATE public.index_api_keys
       SET last_used_at = NOW()
       WHERE id = $1`,
      [apiKey.id]
    );

    next();
  } catch (error) {
    console.error("Authentication failed:", error.message);
    res.status(500).json({
      success: false,
      error: "Authentication service unavailable."
    });
  }
});

// =====================================================
// PROJECT PERMISSIONS
// =====================================================

app.use("/api/projects/:id", async (req, res, next) => {
  if (req.auth?.isMaster) {
    return next();
  }

  const projectId = req.params.id;

  if (!isValidId(projectId)) {
    return res.status(400).json({
      error: "Invalid project ID."
    });
  }

  let permission;

  if (req.method === "GET") {
    permission = "can_read";
  } else if (
    req.method === "POST" &&
    (
      /^\/tables\/?$/.test(req.path) ||
      /^\/tables\/[^/]+\/columns\/?$/.test(req.path)
    )
  ) {
    permission = "can_manage";
  } else {
    permission = "can_write";
  }

  try {
    const result = await pool.query(
      `SELECT ${permission}
       FROM public.index_project_permissions
       WHERE user_id = $1
         AND project_id = $2`,
      [req.auth.userId, projectId]
    );

    if (
      result.rowCount === 0 ||
      result.rows[0][permission] !== true
    ) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission for this project."
      });
    }

    next();
  } catch (error) {
    console.error("Permission check failed:", error.message);
    res.status(500).json({
      error: "Could not verify project permissions."
    });
  }
});

// =====================================================
// API KEY MANAGEMENT
// =====================================================

// Create a user API key. Master key only.
app.post(
  "/api/users/:userId/api-keys",
  requireMaster,
  async (req, res) => {
    const { userId } = req.params;
    const keyName = req.body?.name;

    if (!isValidId(userId)) {
      return res.status(400).json({ error: "Invalid user ID." });
    }

    if (
      typeof keyName !== "string" ||
      !keyName.trim() ||
      keyName.trim().length > 80
    ) {
      return res.status(400).json({
        error: "Key name must be between 1 and 80 characters."
      });
    }

    try {
      const user = await pool.query(
        `SELECT id
         FROM public.index_demo_users
         WHERE id = $1`,
        [userId]
      );

      if (user.rowCount === 0) {
        return res.status(404).json({ error: "User not found." });
      }

      const rawKey = "idx_" + crypto.randomBytes(32).toString("hex");

      const result = await pool.query(
        `INSERT INTO public.index_api_keys
           (user_id, key_name, key_hash)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, key_name, created_at`,
        [userId, keyName.trim(), hashApiKey(rawKey)]
      );

      res.status(201).json({
        success: true,
        apiKey: rawKey,
        details: result.rows[0],
        warning: "Copy this key now. It cannot be retrieved again."
      });
    } catch (error) {
      console.error("API key creation failed:", error.message);
      res.status(500).json({
        error: "Could not create API key."
      });
    }
  }
);

// Revoke a user API key. Master key only.
app.post(
  "/api/api-keys/:keyId/revoke",
  requireMaster,
  async (req, res) => {
    const { keyId } = req.params;

    if (!isValidId(keyId)) {
      return res.status(400).json({ error: "Invalid API key ID." });
    }

    try {
      const result = await pool.query(
        `UPDATE public.index_api_keys
         SET is_active = FALSE,
             revoked_at = NOW()
         WHERE id = $1
           AND is_active = TRUE
         RETURNING id`,
        [keyId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Active API key not found."
        });
      }

      res.json({
        success: true,
        message: "API key revoked."
      });
    } catch (error) {
      console.error("API key revocation failed:", error.message);
      res.status(500).json({
        error: "Could not revoke API key."
      });
    }
  }
);

// Assign or update project permissions. Master key only.
app.put(
  "/api/projects/:projectId/permissions/:userId",
  requireMaster,
  async (req, res) => {
    const { projectId, userId } = req.params;
    const { can_read, can_write, can_manage } = req.body || {};

    if (!isValidId(projectId) || !isValidId(userId)) {
      return res.status(400).json({
        error: "Invalid project ID or user ID."
      });
    }

    for (const value of [can_read, can_write, can_manage]) {
      if (value !== undefined && typeof value !== "boolean") {
        return res.status(400).json({
          error: "Permissions must be boolean values."
        });
      }
    }

    try {
      const result = await pool.query(
        `INSERT INTO public.index_project_permissions
           (user_id, project_id, can_read, can_write, can_manage)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, project_id)
         DO UPDATE SET
           can_read = EXCLUDED.can_read,
           can_write = EXCLUDED.can_write,
           can_manage = EXCLUDED.can_manage
         RETURNING *`,
        [
          userId,
          projectId,
          can_read ?? true,
          can_write ?? false,
          can_manage ?? false
        ]
      );

      res.json({
        success: true,
        permission: result.rows[0]
      });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(404).json({
          error: "User or project not found."
        });
      }

      console.error("Permission update failed:", error.message);
      res.status(500).json({
        error: "Could not update project permissions."
      });
    }
  }
);

// =====================================================
// PROJECT HELPERS
// =====================================================

async function ensureProjectSchema(projectId) {
  const schemaName = `index_project_${projectId}`;

  await pool.query(
    `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`
  );

  return schemaName;
}

async function getProject(projectId) {
  if (!isValidId(String(projectId))) {
    return null;
  }

  const result = await pool.query(
    `SELECT id, name, created_at
     FROM public.index_projects
     WHERE id = $1`,
    [projectId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const project = result.rows[0];
  const schemaName = await ensureProjectSchema(project.id);

  return { ...project, schemaName };
}

async function tableExists(schemaName, tableName) {
  const result = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = $1
       AND table_name = $2
       AND table_type = 'BASE TABLE'`,
    [schemaName, tableName]
  );

  return result.rowCount > 0;
}

// =====================================================
// HEALTH AND SETUP
// =====================================================

app.get("/api/test-route", (req, res) => {
  res.json({
    success: true,
    message: "INDEX Database GET routes are working."
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT current_database() AS database, NOW() AS server_time`
    );

    res.json({
      status: "connected",
      service: "INDEX Database",
      database: result.rows[0].database,
      serverTime: result.rows[0].server_time
    });
  } catch (error) {
    console.error("Health check failed:", error.message);
    res.status(500).json({
      status: "error",
      message: "Database unavailable."
    });
  }
});

app.post("/api/setup", requireMaster, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.index_demo_users (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.index_projects (
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
    res.status(500).json({
      success: false,
      message: "Database setup failed."
    });
  }
});

// =====================================================
// PROJECTS
// =====================================================

app.post("/api/projects", requireMaster, async (req, res) => {
  const { name } = req.body || {};

  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 80
  ) {
    return res.status(400).json({
      error: "Project name must be between 1 and 80 characters."
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO public.index_projects (name)
       VALUES ($1)
       RETURNING id, name, created_at`,
      [name.trim()]
    );

    const project = result.rows[0];
    const schemaName = `index_project_${project.id}`;

    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query("COMMIT");

    res.status(201).json({
      ...project,
      message: "Project and schema created successfully."
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    console.error("Project creation failed:", error.message);
    res.status(500).json({
      error: "Could not create the project."
    });
  } finally {
    if (client) client.release();
  }
});

app.get("/api/projects", async (req, res) => {
  try {
    const result = req.auth.isMaster
      ? await pool.query(
          `SELECT id, name, created_at
           FROM public.index_projects
           ORDER BY id DESC
           LIMIT 100`
        )
      : await pool.query(
          `SELECT p.id, p.name, p.created_at
           FROM public.index_projects p
           JOIN public.index_project_permissions perm
             ON perm.project_id = p.id
           WHERE perm.user_id = $1
             AND perm.can_read = TRUE
           ORDER BY p.id DESC
           LIMIT 100`,
          [req.auth.userId]
        );

    res.json(result.rows);
  } catch (error) {
    console.error("Project listing failed:", error.message);
    res.status(500).json({
      error: "Could not load projects."
    });
  }
});

// =====================================================
// TABLES
// =====================================================

app.get("/api/projects/:id/tables", async (req, res) => {
  try {
    const project = await getProject(req.params.id);

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    const result = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [project.schemaName]
    );

    res.json({
      projectId: project.id,
      projectName: project.name,
      schema: project.schemaName,
      tables: result.rows.map(row => row.table_name)
    });
  } catch (error) {
    console.error("Table listing failed:", error.message);
    res.status(500).json({ error: "Could not list project tables." });
  }
});

app.post("/api/projects/:id/tables", async (req, res) => {
  const { name } = req.body || {};

  if (!isValidIdentifier(name)) {
    return res.status(400).json({ error: "Invalid table name." });
  }

  try {
    const project = await getProject(req.params.id);

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    await pool.query(
      `CREATE TABLE "${project.schemaName}"."${name}" (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    );

    res.status(201).json({
      success: true,
      projectId: project.id,
      table: name,
      message: "Table created successfully."
    });
  } catch (error) {
    if (error.code === "42P07") {
      return res.status(409).json({
        error: "That table already exists."
      });
    }

    console.error("Table creation failed:", error.message);
    res.status(500).json({ error: "Could not create the table." });
  }
});

app.get(
  "/api/projects/:id/tables/:tableName/columns",
  async (req, res) => {
    const { id, tableName } = req.params;

    if (!isValidIdentifier(tableName)) {
      return res.status(400).json({ error: "Invalid table name." });
    }

    try {
      const project = await getProject(id);

      if (!project) {
        return res.status(404).json({ error: "Project not found." });
      }

      const result = await pool.query(
        `SELECT column_name, data_type, is_nullable,
                column_default, ordinal_position
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [project.schemaName, tableName]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Table not found." });
      }

      res.json({
        success: true,
        projectId: project.id,
        table: tableName,
        columns: result.rows.map(column => ({
          name: column.column_name,
          type: column.data_type,
          nullable: column.is_nullable === "YES",
          default: column.column_default,
          position: column.ordinal_position
        }))
      });
    } catch (error) {
      console.error("Column listing failed:", error.message);
      res.status(500).json({
        error: "Could not retrieve table columns."
      });
    }
  }
);

app.post(
  "/api/projects/:id/tables/:tableName/columns",
  async (req, res) => {
    const body = req.body || {};
    const name = body.name ?? body.columnName;
    const { type } = body;
    const { tableName } = req.params;

    if (!isValidIdentifier(tableName) || !isValidIdentifier(name)) {
      return res.status(400).json({
        error: "Invalid table or column name."
      });
    }

    if (
      typeof type !== "string" ||
      !Object.hasOwn(ALLOWED_COLUMN_TYPES, type)
    ) {
      return res.status(400).json({ error: "Unsupported column type." });
    }

    try {
      const project = await getProject(req.params.id);

      if (!project) {
        return res.status(404).json({ error: "Project not found." });
      }

      if (!(await tableExists(project.schemaName, tableName))) {
        return res.status(404).json({ error: "Table not found." });
      }

      await pool.query(
        `ALTER TABLE "${project.schemaName}"."${tableName}"
         ADD COLUMN "${name}" ${ALLOWED_COLUMN_TYPES[type]}`
      );

      res.status(201).json({
        success: true,
        projectId: project.id,
        table: tableName,
        column: name,
        type,
        message: "Column added successfully."
      });
    } catch (error) {
      if (error.code === "42701") {
        return res.status(409).json({
          error: "That column already exists."
        });
      }

      console.error("Column creation failed:", error.message);
      res.status(500).json({ error: "Could not add the column." });
    }
  }
);

// =====================================================
// RECORDS: READ
// =====================================================

app.get(
  "/api/projects/:id/tables/:tableName/rows",
  async (req, res) => {
    const { id, tableName } = req.params;

    if (!isValidIdentifier(tableName)) {
      return res.status(400).json({ error: "Invalid table name." });
    }

    try {
      const project = await getProject(id);

      if (!project) {
        return res.status(404).json({ error: "Project not found." });
      }

      if (!(await tableExists(project.schemaName, tableName))) {
        return res.status(404).json({ error: "Table not found." });
      }

      const result = await pool.query(
        `SELECT *
         FROM "${project.schemaName}"."${tableName}"
         ORDER BY id DESC
         LIMIT 100`
      );

      res.json({
        success: true,
        projectId: project.id,
        table: tableName,
        count: result.rows.length,
        rows: result.rows
      });
    } catch (error) {
      console.error("Record retrieval failed:", error.message);
      res.status(500).json({ error: "Could not retrieve table records." });
    }
  }
);

// =====================================================
// RECORDS: INSERT
// =====================================================

app.post(
  "/api/projects/:id/tables/:tableName/rows",
  async (req, res) => {
    const { id, tableName } = req.params;
    const data = req.body;

    if (!isValidIdentifier(tableName)) {
      return res.status(400).json({ error: "Invalid table name." });
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).length === 0
    ) {
      return res.status(400).json({
        error: "Provide a non-empty JSON object of column values."
      });
    }

    const columnNames = Object.keys(data);

    if (!columnNames.every(isValidIdentifier)) {
      return res.status(400).json({ error: "Invalid column name." });
    }

    try {
      const project = await getProject(id);

      if (!project) {
        return res.status(404).json({ error: "Project not found." });
      }

      const columnsResult = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2`,
        [project.schemaName, tableName]
      );

      const existingColumns = new Set(
        columnsResult.rows.map(row => row.column_name)
      );

      if (existingColumns.size === 0) {
        return res.status(404).json({ error: "Table not found." });
      }

      for (const name of columnNames) {
        if (!existingColumns.has(name)) {
          return res.status(400).json({
            error: `Column '${name}' does not exist.`
          });
        }

        if (name === "id" || name === "created_at") {
          return res.status(400).json({
            error: `Column '${name}' is managed by the database.`
          });
        }
      }

      const quotedColumns = columnNames.map(name => `"${name}"`).join(", ");
      const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(", ");
      const values = columnNames.map(name => data[name]);

      const result = await pool.query(
        `INSERT INTO "${project.schemaName}"."${tableName}"
           (${quotedColumns})
         VALUES (${placeholders})
         RETURNING *`,
        values
      );

      res.status(201).json({
        success: true,
        projectId: project.id,
        table: tableName,
        row: result.rows[0]
      });
    } catch (error) {
      console.error("Record insertion failed:", error.message);
      res.status(500).json({
        error: "Could not insert record. Check the values and column types."
      });
    }
  }
);

// =====================================================
// RECORDS: UPDATE
// =====================================================

app.put(
  "/api/projects/:id/tables/:tableName/rows/:rowId",
  async (req, res) => {
    const { id, tableName, rowId } = req.params;
    const data = req.body;

    if (!isValidIdentifier(tableName) || !isValidId(rowId)) {
      return res.status(400).json({
        error: "Invalid table name or record ID."
      });
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).length === 0
    ) {
      return res.status(400).json({
        error: "Provide a non-empty JSON object of column values."
      });
    }

    const columnNames = Object.keys(data);

    if (!columnNames.every(isValidIdentifier)) {
      return res.status(400).json({ error: "Invalid column name." });
    }

    try {
      const project = await getProject(id);

      if (!project) {
        return res.status(404).json({ error: "Project not found." });
      }

      const columnsResult = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2`,
        [project.schemaName, tableName]
      );

      const existingColumns = new Set(
        columnsResult.rows.map(row => row.column_name)
      );

      if (existingColumns.size === 0) {
        return res.status(404).json({ error: "Table not found." });
      }

      for (const name of columnNames) {
        if (!existingColumns.has(name)) {
          return res.status(400).json({
            error: `Column '${name}' does not exist.`
          });
        }

        if (name === "id" || name === "created_at") {
          return res.status(400).json({
            error: `Column '${name}' cannot be updated.`
          });
        }
      }

      const assignments = columnNames
        .map((name, i) => `"${name}" = $${i + 1}`)
        .join(", ");

      const values = columnNames.map(name => data[name]);
      values.push(rowId);

      const result = await pool.query(
        `UPDATE "${project.schemaName}"."${tableName}"
         SET ${assignments}
         WHERE id = $${values.length}
         RETURNING *`,
        values
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Record not found." });
      }

      res.json({
        success: true,
        projectId: project.id,
        table: tableName,
        row: result.rows[0]
      });
    } catch (error) {
      console.error("Record update failed:", error.message);
      res.status(500).json({
        error: "Could not update record. Check the values and column types."
      });
    }
  }
);

// =====================================================
// RECORDS: DELETE
// =====================================================

app.delete(
  "/api/projects/:id/tables/:tableName/rows/:rowId",
  async (req, res) => {
    const { id, tableName, rowId } = req.params;

    if (
      !isValidId(id) ||
      !isValidIdentifier(tableName) ||
      !isValidId(rowId)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid project ID, table name, or record ID."
      });
    }

    try {
      const project = await getProject(id);

      if (!project) {
        return res.status(404).json({
          success: false,
          error: "Project not found."
        });
      }

      if (!(await tableExists(project.schemaName, tableName))) {
        return res.status(404).json({
          success: false,
          error: "Table not found."
        });
      }

      const result = await pool.query(
        `DELETE FROM "${project.schemaName}"."${tableName}"
         WHERE id = $1
         RETURNING *`,
        [rowId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: "Record not found."
        });
      }

      res.json({
        success: true,
        projectId: project.id,
        table: tableName,
        deletedRow: result.rows[0],
        message: "Record deleted successfully."
      });
    } catch (error) {
      console.error("Record deletion failed:", error.message);
      res.status(500).json({
        success: false,
        error: "Could not delete record."
      });
    }
  }
);

// =====================================================
// USERS: MASTER KEY ONLY
// =====================================================

app.post("/api/users", requireMaster, async (req, res) => {
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
      `INSERT INTO public.index_demo_users (username)
       VALUES ($1)
       RETURNING id, username, created_at`,
      [username.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("User creation failed:", error.message);
    res.status(500).json({ error: "Could not save the user." });
  }
});

app.get("/api/users", requireMaster, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, created_at
       FROM public.index_demo_users
       ORDER BY id DESC
       LIMIT 100`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("User retrieval failed:", error.message);
    res.status(500).json({ error: "Could not retrieve users." });
  }
});

// =====================================================
// FRONTEND AND FALLBACK
// =====================================================

app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API route not found.",
    method: req.method,
    path: req.originalUrl
  });
});

// =====================================================
// START SERVER
// =====================================================

console.log("Registered routes:");

const routeStack = app.router?.stack || app._router?.stack || [];

routeStack.forEach(layer => {
  if (layer.route) {
    console.log(
      Object.keys(layer.route.methods).join(",").toUpperCase(),
      layer.route.path
    );
  }
});

app.listen(PORT, () => {
  console.log(`INDEX Database running at http://localhost:${PORT}`);
});