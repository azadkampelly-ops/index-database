
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

function showMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`;
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

function showEmptyRow(table, text) {
  const row = document.createElement("tr");
  const cell = makeCell(text);
  cell.colSpan = 4;
  cell.className = "empty";
  row.appendChild(cell);
  table.replaceChildren(row);
}

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
    if (!response.ok) throw new Error("Health check failed");

    const data = await response.json();
    setConnection(data.status === "connected", data.database);
  } catch {
    setConnection(false);
  }
}

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

      const statusCell = document.createElement("td");
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
      showEmptyRow(
        projectsTable,
        "No projects yet. Create your first project above."
      );
      return;
    }

    for (const project of projects) {
      const row = document.createElement("tr");

      row.appendChild(makeCell(project.id));
      row.appendChild(makeCell(project.name));
      row.appendChild(makeCell(formatDate(project.created_at)));

      const statusCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "pill";
      badge.textContent = "Created";
      statusCell.appendChild(badge);
      row.appendChild(statusCell);

      projectsTable.appendChild(row);
    }
  } catch (error) {
    projectCount.textContent = "—";
    showEmptyRow(projectsTable, error.message);
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

projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = projectNameInput.value.trim();

  if (!name || name.length > 80) {
    showMessage(
      projectMessage,
      "Enter a project name between 1 and 80 characters.",
      "error"
    );
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
      throw new Error(result.error || "Could not create the project.");
    }

    projectNameInput.value = "";

    showMessage(
      projectMessage,
      `Project "${result.name}" created successfully. ID: ${result.id}`,
      "success"
    );

    await refreshDashboard();
  } catch (error) {
    showMessage(projectMessage, error.message, "error");
  } finally {
    createProjectBtn.disabled = false;
    createProjectBtn.textContent = "+ Create project";
  }
});

userForm.addEventListener("submit", async (event) => {
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
  showMessage(message, "");

  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not save the record.");
    }

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

refreshBtn.addEventListener("click", refreshDashboard);

refreshDashboard();
