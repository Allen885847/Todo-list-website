const STORAGE_KEY = "todo-list-mvp";

const titleInput = document.querySelector("#list-title");
const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const addTaskButton = document.querySelector("#add-task-button");
const formStatus = document.querySelector("#form-status");
const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const emptyState = document.querySelector("#empty-state");

let state = loadState();

function normalizeTask(task) {
  const now = new Date();
  const date = task.date || {
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };

  return {
    id: task.id || crypto.randomUUID(),
    date: {
      day: Number(date.day),
      month: Number(date.month),
      year: Number(date.year),
    },
    task: String(task.task ?? task.text ?? "Untitled task"),
    completed: Boolean(task.completed),
  };
}

function loadState() {
  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (savedState && Array.isArray(savedState.tasks)) {
      return {
        title: savedState.title || "Today’s focus",
        tasks: savedState.tasks.map(normalizeTask),
      };
    }
  } catch (error) {
    console.warn("The saved todo list could not be loaded.", error);
  }

  return { title: "Today’s focus", tasks: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date.year, date.month - 1, date.day));
}

function createTaskElement(todo) {
  const item = document.createElement("li");
  item.className = `task-item${todo.completed ? " completed" : ""}`;
  item.dataset.id = todo.id;

  const checkbox = document.createElement("input");
  checkbox.className = "task-checkbox";
  checkbox.type = "checkbox";
  checkbox.checked = todo.completed;
  checkbox.setAttribute("aria-label", `Mark ${todo.task} as complete`);

  const content = document.createElement("div");
  content.className = "task-content";

  const date = document.createElement("time");
  date.className = "task-date";
  date.dateTime = `${todo.date.year}-${String(todo.date.month).padStart(2, "0")}-${String(todo.date.day).padStart(2, "0")}`;
  date.textContent = formatDate(todo.date);

  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = todo.task;

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-task";
  deleteButton.type = "button";
  deleteButton.innerHTML = "&times;";
  deleteButton.setAttribute("aria-label", `Delete ${todo.task}`);
  deleteButton.title = "Delete task";

  checkbox.addEventListener("change", () => toggleTask(todo.id));
  deleteButton.addEventListener("click", () => deleteTask(todo.id));

  content.append(date, text);
  item.append(checkbox, content, deleteButton);
  return item;
}

function render() {
  taskList.replaceChildren(...state.tasks.map(createTaskElement));
  titleInput.value = state.title;

  const remaining = state.tasks.filter((todo) => !todo.completed).length;
  const total = state.tasks.length;
  taskCount.textContent = total === 1 ? `${remaining} of 1 task left` : `${remaining} of ${total} tasks left`;
  emptyState.hidden = total > 0;
}

function addTask(todo) {
  state.tasks.unshift(normalizeTask({ ...todo, completed: false }));
  saveState();
  render();
}

function toggleTask(id) {
  const todo = state.tasks.find((item) => item.id === id);
  if (!todo) return;

  todo.completed = !todo.completed;
  saveState();
  render();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((todo) => todo.id !== id);
  saveState();
  render();
}

function setFormStatus(message, isError = false) {
  formStatus.textContent = message;
  formStatus.classList.toggle("error", isError);
}

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = taskInput.value.trim();
  if (!input) return;

  addTaskButton.disabled = true;
  addTaskButton.textContent = "Thinking…";
  setFormStatus("DeepSeek is finding the date and task…");

  try {
    const response = await fetch("/api/parse-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "The task could not be understood.");
    }

    addTask(result.task);
    taskForm.reset();
    setFormStatus("Task added. Click the checkbox when it is complete.");
    taskInput.focus();
  } catch (error) {
    setFormStatus(error.message, true);
  } finally {
    addTaskButton.disabled = false;
    addTaskButton.textContent = "Ask AI";
  }
});

titleInput.addEventListener("input", () => {
  state.title = titleInput.value;
  saveState();
});

titleInput.addEventListener("blur", () => {
  if (!titleInput.value.trim()) {
    state.title = "Today’s focus";
    saveState();
    render();
  }
});

render();
