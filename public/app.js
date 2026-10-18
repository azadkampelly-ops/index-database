
const connectionStatus = document.getElementById("connectionStatus");
const connectionDot = document.getElementById("connectionDot");
const databaseName = document.getElementById("databaseName");
const recordCount = document.getElementById("recordCount");
const projectCount = document.getElementById("projectCount");

const usersTable = document.getElementById("usersTable");
const projectsTable = document.getElementById("projectsTable");

const userForm = document.getElementById("userForm");
const usernameInput = document.getElementById("username");
const saveBtn = document.getElementById("saveBtn");

const projectForm = document.getElementById("projectForm");
const projectNameInput = document.getElementById("projectName");
const createProjectBtn = document.getElementById("createProjectBtn");

const refreshBtn = document.getElementById("refreshBtn");
const message = document.getElementById("message");
const projectMessage = document.getElementById("projectMessage");

// Shared message and table helpers.
function showMessage(element, text, type = "") {
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
  const row = document.createElement("tr");
  const cell = makeCell(text);
  cell.colSpan = columns;
  cell.className = "empty";
  row.appendChild(cell);
  table.replaceChildren(row);
}

// Table Manager UI.
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
        <option value="">Loading projects...</option>
      </select>
    </div>

    <label for="tableName" style="display:block;margin-top:16px">
      Table name
    </label>
    <div class="form-row">
      <input id="tableName" type="text" maxlength="63"
        pattern="[a-z][a-z0-9_]*" placeholder="e.g. orders" required>
      <button id="createTableBtn" class="button primary" type="submit">
        + Create table
      </button>
    </div>
  </form>

  <p id="tableMessage" class="message" role="status" aria-live="polite"></p>

  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>TABLE NAME</th><th>PROJECT SCHEMA</th><th>STATUS</th></tr>
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

const tableForm = document.getElementById("tableForm");
const tableProject = document.getElementById("tableProject");
const tableNameInput = document.getElementById("tableName");
const createTableBtn = document.getElementById("createTableBtn");
const tableMessage = document.getElementById("tableMessage");
const projectTables = document.getElementById("projectTables");

// Column Manager UI.
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
        pattern="[a-z][a-z0-9_]*" placeholder="e.g. website_name" required>
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

  <p id="columnMessage" class="message" role="status" aria-live="polite"></p>
`;

if (footer) {
  footer.before(columnManager);
} else {
  document.body.appendChild(columnManager);
}

const columnForm = document.getElementById("columnForm");
const columnProject = document.getElementById("columnProject");
const columnTable = document.getElementById("columnTable");
const columnNameInput = document.getElementById("columnName");
const columnType = document.getElementById("columnType");
const addColumnBtn = document.getElementById("addColumnBtn");
const columnMessage = document.getElementById("columnMessage");

// Connection status.
function setConnection(connected, database = "") {
  connectionStatus.textContent = connected ? "Connected" : "Unavailable";
  connectionDot.style.background = connected ? "#10b981" : "#ef4444";
  databaseName.textContent = connected
    ? `Database: ${database}`
    : "Check your local API";
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();

    if (!response.ok) throw new Error("Health check failed");

    setConnection(data.status === "connected", data.database);
  } catch {
    setConnection(false);
  }
}

// Test records.
async function loadUsers() {
  try {
    const response = await fetch("/api/users");
    const users = await response.json();

    if (!response.ok) {
      throw new Error(users.error || "Could not load records.");
    }

    recordCount.textContent = users.length;
    usersTable.replaceChildren();

    if (users.length === 0) {
      showEmptyRow(usersTable, "No records yet. Add your first one above.");
      return;
    }

    for (const user of users) {
      const row = document.createElement("tr");
      row.appendChild(makeCell(user.id));
      row.appendChild(makeCell(user.username));
      row.appendChild(makeCell(formatDate(user.created_at)));

      const statusCell = makeCell("");
      const badge = document.createElement("span");
      badge.className = "pill";
      badge.textContent = "Saved";
      statusCell.appendChild(badge);
      row.appendChild(statusCell);
      usersTable.appendChild(row);
    }
  } catch (error) {
    recordCount.textContent = "—";
    showEmptyRow(usersTable, error.message);
  }
}

// Load projects into dashboard and both project selectors.
async function loadProjects() {
  try {
    const response = await fetch("/api/projects");
    const projects = await response.json();

    if (!response.ok) {
      throw new Error(projects.error || "Could not load projects.");
    }

    projectCount.textContent = projects.length;
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
        const badge = document.createElement("span");
        badge.className = "pill";
        badge.textContent = "Created";
        statusCell.appendChild(badge);
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
    projectCount.textContent = "—";
    showEmptyRow(projectsTable, error.message);

    for (const select of [tableProject, columnProject]) {
      select.replaceChildren();
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Could not load projects";
      select.appendChild(option);
    }
  }
}

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

// Table listing.
async function loadProjectTables() {
  const projectId = tableProject.value;

  if (!projectId) {
    showEmptyRow(projectTables, "Select a project.", 3);
    return;
  }

  showEmptyRow(projectTables, "Loading tables...", 3);

  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/tables`
    );
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not load tables.");
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
        const badge = document.createElement("span");
        badge.className = "pill";
        badge.textContent = "Available";
        statusCell.appendChild(badge);
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

// Column Manager: load tables for the selected project.
async function loadColumnTables() {
  const projectId = columnProject.value;
  columnTable.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a table...";
  columnTable.appendChild(placeholder);

  if (!projectId) return;

  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/tables`
    );
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not load tables.");
    }

    for (const name of result.tables) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      columnTable.appendChild(option);
    }

    if (result.tables.length === 0) {
      showMessage(columnMessage, "This project has no tables yet.");
    } else {
      showMessage(columnMessage, "");
    }
  } catch (error) {
    showMessage(columnMessage, error.message, "error");
  }
}

async function refreshDashboard() {
  refreshBtn.disabled = true;

  try {
    await Promise.all([
      loadHealth(),
      loadUsers(),
      loadProjects()
    ]);
  } finally {
    refreshBtn.disabled = false;
  }
}

// Create project.
projectForm.addEventListener("submit", async event => {
  event.preventDefault();

  const name = projectNameInput.value.trim();

  if (!name || name.length > 80) {
    showMessage(projectMessage, "Enter a project name up to 80 characters.", "error");
    return;
  }

  createProjectBtn.disabled = true;
  createProjectBtn.textContent = "Creating...";
  showMessage(projectMessage, "");

  try {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not create project.");
    }

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

// Create table.
tableProject.addEventListener("change", loadProjectTables);
columnProject.addEventListener("change", loadColumnTables);

tableForm.addEventListener("submit", async event => {
  event.preventDefault();

  const projectId = tableProject.value;
  const name = tableNameInput.value.trim();

  if (!projectId) {
    showMessage(tableMessage, "Select a project first.", "error");
    return;
  }

  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) {
    showMessage(tableMessage, "Use lowercase letters, numbers, and underscores.", "error");
    return;
  }

  createTableBtn.disabled = true;
  createTableBtn.textContent = "Creating...";

  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/tables`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      }
    );
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not create table.");
    }

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

// Add custom column.
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
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/tables/${encodeURIComponent(tableName)}/columns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type })
      }
    );
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not add column.");
    }

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

// Save test record.
userForm.addEventListener("submit", async event => {
  event.preventDefault();

  const username = usernameInput.value.trim();

  if (!username || username.length > 100) {
    showMessage(message, "Enter a username between 1 and 100 characters.", "error");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not save record.");
    }

    usernameInput.value = "";
    showMessage(message, `Record ${result.id} saved successfully.`, "success");
    await refreshDashboard();
  } catch (error) {
    showMessage(message, error.message, "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "+ Save record";
  }
});

refreshBtn.addEventListener("click", refreshDashboard);

refreshDashboard();
