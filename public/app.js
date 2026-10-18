
"use strict";

// =====================================================
// INDEX DATABASE — Dashboard Frontend
// File: public/app.js
// =====================================================

const $ = (id) => document.getElementById(id);

const connectionStatus = $("connectionStatus");
const connectionDot = $("connectionDot");
const databaseName = $("databaseName");
const recordCount = $("recordCount");
const projectCount = $("projectCount");

const usersTable = $("usersTable");
const projectsTable = $("projectsTable");

const userForm = $("userForm");
const usernameInput = $("username");
const saveBtn = $("saveBtn");

const projectForm = $("projectForm");
const projectNameInput = $("projectName");
const createProjectBtn = $("createProjectBtn");

const refreshBtn = $("refreshBtn");
const message = $("message");
const projectMessage = $("projectMessage");

// =====================================================
// API HELPER
// Uses same-origin cookies for a future/server-side
// dashboard session. Never put the master API key here.
// =====================================================

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const contentType = response.headers.get("content-type") || "";
  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = { error: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

// =====================================================
// HELPERS
// =====================================================

function showMessage(element, text, type = "") {
  if (!element) return;

  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function makeCell(value) {
  const cell = document.createElement("td");
  cell.textContent = String(value ?? "");
  return cell;
}

function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleString();
}

function showEmptyRow(table, text, columns = 4) {
  if (!table) return;

  const row = document.createElement("tr");
  const cell = makeCell(text);

  cell.colSpan = columns;
  cell.className = "empty";

  row.appendChild(cell);
  table.replaceChildren(row);
}

function setConnection(connected, database = "") {
  if (connectionStatus) {
    connectionStatus.textContent = connected
      ? "Connected"
      : "Unavailable";
  }

  if (connectionDot) {
    connectionDot.style.background = connected
      ? "#10b981"
      : "#ef4444";
  }

  if (databaseName) {
    databaseName.textContent = connected
      ? `Database: ${database || "PostgreSQL"}`
      : "Check API authentication and database connection";
  }
}

function makeStatusBadge(text) {
  const badge = document.createElement("span");
  badge.className = "pill";
  badge.textContent = text;
  return badge;
}

// =====================================================
// TABLE MANAGER UI
// =====================================================

const tableManager = document.createElement("section");
tableManager.id = "tableManager";
tableManager.className = "panel";

tableManager.innerHTML = `
  <div class="panel-header">
    <div>
      <h2>Table Manager</h2>
      <p class="muted">Manage tables inside a selected project.</p>
    </div>
  </div>

  <form id="tableForm" class="create-form">
    <label for="tableProject">Select project</label>
    <div class="form-row">
      <select id="tableProject" required>
        <option value="">Choose a project...</option>
      </select>
    </div>

    <label for="tableName" style="display:block;margin-top:16px">
      Table name
    </label>
    <div class="form-row">
      <input id="tableName" type="text" maxlength="63"
        pattern="[a-z][a-z0-9_]*"
        placeholder="e.g. orders" required>
      <button id="createTableBtn" class="button primary" type="submit">
        + Create table
      </button>
    </div>
  </form>

  <p id="tableMessage" class="message"
    role="status" aria-live="polite"></p>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>TABLE NAME</th>
          <th>PROJECT SCHEMA</th>
          <th>STATUS</th>
        </tr>
      </thead>
      <tbody id="projectTables">
        <tr><td colspan="3" class="empty">Select a project.</td></tr>
      </tbody>
    </table>
  </div>
`;

const footer = document.querySelector("footer");

if (footer) {
  footer.before(tableManager);
} else {
  document.body.appendChild(tableManager);
}

const tableForm = $("tableForm");
const tableProject = $("tableProject");
const tableNameInput = $("tableName");
const createTableBtn = $("createTableBtn");
const tableMessage = $("tableMessage");
const projectTables = $("projectTables");

// =====================================================
// COLUMN MANAGER UI
// =====================================================

const columnManager = document.createElement("section");
columnManager.id = "columnManager";
columnManager.className = "panel";

columnManager.innerHTML = `
  <div class="panel-header">
    <div>
      <h2>Column Manager</h2>
      <p class="muted">Add columns to tables in your projects.</p>
    </div>
  </div>

  <form id="columnForm" class="create-form">
    <label for="columnProject">Select project</label>
    <div class="form-row">
      <select id="columnProject" required>
        <option value="">Choose a project...</option>
      </select>
    </div>

    <label for="columnTable" style="display:block;margin-top:16px">
      Select table
    </label>
    <div class="form-row">
      <select id="columnTable" required>
        <option value="">Choose a table...</option>
      </select>
    </div>

    <label for="columnName" style="display:block;margin-top:16px">
      Column name
    </label>
    <div class="form-row">
      <input id="columnName" type="text" maxlength="63"
        pattern="[a-z][a-z0-9_]*"
        placeholder="e.g. website_name" required>
    </div>

    <label for="columnType" style="display:block;margin-top:16px">
      Data type
    </label>
    <div class="form-row">
      <select id="columnType" required>
        <option value="text">TEXT</option>
        <option value="integer">INTEGER</option>
        <option value="boolean">BOOLEAN</option>
        <option value="date">DATE</option>
        <option value="timestamp">TIMESTAMPTZ</option>
      </select>

      <button id="addColumnBtn" class="button primary" type="submit">
        + Add column
      </button>
    </div>
  </form>

  <p id="columnMessage" class="message"
    role="status" aria-live="polite"></p>
`;

if (footer) {
  footer.before(columnManager);
} else {
  document.body.appendChild(columnManager);
}

const columnForm = $("columnForm");
const columnProject = $("columnProject");
const columnTable = $("columnTable");
const columnNameInput = $("columnName");
const columnType = $("columnType");
const addColumnBtn = $("addColumnBtn");
const columnMessage = $("columnMessage");

// =====================================================
// HEALTH CHECK
// Public /health checks whether the web service is alive.
// /api/health checks database connectivity and requires
// whatever authentication the backend configures.
// =====================================================

async function loadHealth() {
  try {
    // Check public service status first.
    const service = await apiRequest("/health");

    if (service.status !== "running") {
      throw new Error("Service is not running.");
    }

    // Check PostgreSQL separately.
    try {
      const database = await apiRequest("/api/health");

      setConnection(
        database.status === "connected",
        database.database || "PostgreSQL"
      );
    } catch (error) {
      setConnection(false);
      if (databaseName) {
        databaseName.textContent =
          `Service online; database check failed: ${error.message}`;
      }
    }
  } catch {
    setConnection(false);
  }
}

// =====================================================
// LOAD TEST RECORDS
// =====================================================

async function loadUsers() {
  try {
    const users = await apiRequest("/api/users");

    if (!Array.isArray(users)) {
      throw new Error("Unexpected records response.");
    }

    if (recordCount) {
      recordCount.textContent = users.length;
    }

    usersTable.replaceChildren();

    if (users.length === 0) {
      showEmptyRow(
        usersTable,
        "No records yet. Add your first one above."
      );
      return;
    }

    for (const user of users) {
      const row = document.createElement("tr");

      row.appendChild(makeCell(user.id));
      row.appendChild(makeCell(user.username));
      row.appendChild(makeCell(formatDate(user.created_at)));

      const statusCell = makeCell("");
      statusCell.appendChild(makeStatusBadge("Saved"));
      row.appendChild(statusCell);

      usersTable.appendChild(row);
    }
  } catch (error) {
    if (recordCount) recordCount.textContent = "—";

    showEmptyRow(usersTable, error.message);
  }
}

// =====================================================
// PROJECT SELECTORS
// =====================================================

function fillProjectSelect(select, projects) {
  const previous = select.value;

  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a project...";
  select.appendChild(placeholder);

  for (const project of projects) {
    const option = document.createElement("option");

    option.value = String(project.id);
    option.textContent = `${project.name} (ID: ${project.id})`;

    select.appendChild(option);
  }

  if (projects.some(project => String(project.id) === previous)) {
    select.value = previous;
  } else if (projects.length > 0) {
    select.value = String(projects[0].id);
  }
}

// =====================================================
// LOAD PROJECTS
// =====================================================

async function loadProjects() {
  try {
    const projects = await apiRequest("/api/projects");

    if (!Array.isArray(projects)) {
      throw new Error("Unexpected projects response.");
    }

    if (projectCount) {
      projectCount.textContent = projects.length;
    }

    projectsTable.replaceChildren();

    if (projects.length === 0) {
      showEmptyRow(projectsTable, "Create your first project above.");
    } else {
      for (const project of projects) {
        const row = document.createElement("tr");

        row.appendChild(makeCell(project.id));
        row.appendChild(makeCell(project.name));
        row.appendChild(makeCell(formatDate(project.created_at)));

        const statusCell = makeCell("");
        statusCell.appendChild(makeStatusBadge("Created"));
        row.appendChild(statusCell);

        projectsTable.appendChild(row);
      }
    }

    fillProjectSelect(tableProject, projects);
    fillProjectSelect(columnProject, projects);

    await Promise.all([
      loadProjectTables(),
      loadColumnTables()
    ]);
  } catch (error) {
    if (projectCount) projectCount.textContent = "—";

    showEmptyRow(projectsTable, error.message);

    for (const select of [tableProject, columnProject]) {
      select.replaceChildren();

      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Could not load projects";

      select.appendChild(option);
    }

    showMessage(projectMessage, error.message, "error");
  }
}

// =====================================================
// LOAD TABLES FOR SELECTED PROJECT
// =====================================================

async function loadProjectTables() {
  const projectId = tableProject.value;

  if (!projectId) {
    showEmptyRow(projectTables, "Select a project.", 3);
    return;
  }

  showEmptyRow(projectTables, "Loading tables...", 3);

  try {
    const result = await apiRequest(
      `/api/projects/${encodeURIComponent(projectId)}/tables`
    );

    if (!Array.isArray(result.tables)) {
      throw new Error("Unexpected tables response.");
    }

    projectTables.replaceChildren();

    if (result.tables.length === 0) {
      showEmptyRow(projectTables, "No tables yet. Create one above.", 3);
    } else {
      for (const name of result.tables) {
        const row = document.createElement("tr");

        row.appendChild(makeCell(name));
        row.appendChild(makeCell(result.schema));

        const statusCell = makeCell("");
        statusCell.appendChild(makeStatusBadge("Available"));
        row.appendChild(statusCell);

        projectTables.appendChild(row);
      }
    }

    showMessage(
      tableMessage,
      `${result.tables.length} table(s) in ${result.schema}.`
    );
  } catch (error) {
    showEmptyRow(projectTables, error.message, 3);
    showMessage(tableMessage, error.message, "error");
  }
}

// =====================================================
// LOAD TABLES FOR COLUMN MANAGER
// =====================================================

async function loadColumnTables() {
  const projectId = columnProject.value;

  columnTable.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a table...";
  columnTable.appendChild(placeholder);

  if (!projectId) return;

  try {
    const result = await apiRequest(
      `/api/projects/${encodeURIComponent(projectId)}/tables`
    );

    if (!Array.isArray(result.tables)) {
      throw new Error("Unexpected tables response.");
    }

    for (const name of result.tables) {
      const option = document.createElement("option");

      option.value = name;
      option.textContent = name;

      columnTable.appendChild(option);
    }

    showMessage(
      columnMessage,
      result.tables.length === 0
        ? "This project has no tables yet."
        : ""
    );
  } catch (error) {
    showMessage(columnMessage, error.message, "error");
  }
}

// =====================================================
// REFRESH DASHBOARD
// =====================================================

async function refreshDashboard() {
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    await Promise.all([
      loadHealth(),
      loadUsers(),
      loadProjects()
    ]);
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// =====================================================
// CREATE PROJECT
// =====================================================

projectForm.addEventListener("submit", async event => {
  event.preventDefault();

  const name = projectNameInput.value.trim();

  if (!name || name.length > 80) {
    showMessage(
      projectMessage,
      "Enter a project name up to 80 characters.",
      "error"
    );
    return;
  }

  createProjectBtn.disabled = true;
  createProjectBtn.textContent = "Creating...";

  showMessage(projectMessage, "");

  try {
    const result = await apiRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name })
    });

    projectNameInput.value = "";

    showMessage(
      projectMessage,
      `Project "${result.name}" created successfully. ID: ${result.id}`,
      "success"
    );

    await refreshDashboard();

    tableProject.value = String(result.id);
    columnProject.value = String(result.id);

    await Promise.all([
      loadProjectTables(),
      loadColumnTables()
    ]);
  } catch (error) {
    showMessage(projectMessage, error.message, "error");
  } finally {
    createProjectBtn.disabled = false;
    createProjectBtn.textContent = "+ Create project";
  }
});

// =====================================================
// TABLE SELECTION
// =====================================================

tableProject.addEventListener("change", loadProjectTables);
columnProject.addEventListener("change", loadColumnTables);

// =====================================================
// CREATE TABLE
// =====================================================

tableForm.addEventListener("submit", async event => {
  event.preventDefault();

  const projectId = tableProject.value;
  const name = tableNameInput.value.trim();

  if (!projectId) {
    showMessage(tableMessage, "Select a project first.", "error");
    return;
  }

  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) {
    showMessage(
      tableMessage,
      "Use lowercase letters, numbers, and underscores.",
      "error"
    );
    return;
  }

  createTableBtn.disabled = true;
  createTableBtn.textContent = "Creating...";

  try {
    const result = await apiRequest(
      `/api/projects/${encodeURIComponent(projectId)}/tables`,
      {
        method: "POST",
        body: JSON.stringify({ name })
      }
    );

    tableNameInput.value = "";

    showMessage(
      tableMessage,
      `Table "${result.table}" created in Project ${projectId}.`,
      "success"
    );

    await Promise.all([
      loadProjectTables(),
      loadColumnTables()
    ]);
  } catch (error) {
    showMessage(tableMessage, error.message, "error");
  } finally {
    createTableBtn.disabled = false;
    createTableBtn.textContent = "+ Create table";
  }
});

// =====================================================
// ADD COLUMN
// =====================================================

columnForm.addEventListener("submit", async event => {
  event.preventDefault();

  const projectId = columnProject.value;
  const tableName = columnTable.value;
  const name = columnNameInput.value.trim();
  const type = columnType.value;

  if (!projectId || !tableName) {
    showMessage(columnMessage, "Select a project and table.", "error");
    return;
  }

  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) {
    showMessage(columnMessage, "Invalid column name.", "error");
    return;
  }

  addColumnBtn.disabled = true;
  addColumnBtn.textContent = "Adding...";

  try {
    const result = await apiRequest(
      `/api/projects/${encodeURIComponent(projectId)}/tables/${encodeURIComponent(tableName)}/columns`,
      {
        method: "POST",
        body: JSON.stringify({ name, type })
      }
    );

    columnNameInput.value = "";

    showMessage(
      columnMessage,
      `Column "${result.column}" (${result.type}) added to "${result.table}".`,
      "success"
    );
  } catch (error) {
    showMessage(columnMessage, error.message, "error");
  } finally {
    addColumnBtn.disabled = false;
    addColumnBtn.textContent = "+ Add column";
  }
});

// =====================================================
// SAVE TEST RECORD
// =====================================================

userForm.addEventListener("submit", async event => {
  event.preventDefault();

  const username = usernameInput.value.trim();

  if (!username || username.length > 100) {
    showMessage(
      message,
      "Enter a username between 1 and 100 characters.",
      "error"
    );
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const result = await apiRequest("/api/users", {
      method: "POST",
      body: JSON.stringify({ username })
    });

    usernameInput.value = "";

    showMessage(
      message,
      `Record ${result.id} saved successfully.`,
      "success"
    );

    await refreshDashboard();
  } catch (error) {
    showMessage(message, error.message, "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "+ Save record";
  }
});

// =====================================================
// REFRESH BUTTON
// =====================================================

if (refreshBtn) {
  refreshBtn.addEventListener("click", refreshDashboard);
}

// =====================================================
// START
// =====================================================

refreshDashboard();
