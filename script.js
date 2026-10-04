const STORAGE_KEY = "todo-list-mvp";

const titleInput = document.querySelector("#list-title");
const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const emptyState = document.querySelector("#empty-state");

let state = loadState();

function loadState() {
  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (savedState && Array.isArray(savedState.tasks)) {
      return {
        title: savedState.title || "Today’s focus",
        tasks: savedState.tasks,
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

function createTaskElement(task) {
  const item = document.createElement("li");
  item.className = `task-item${task.completed ? " completed" : ""}`;
  item.dataset.id = task.id;

  const checkbox = document.createElement("input");
  checkbox.className = "task-checkbox";
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", `Mark ${task.text} as complete`);

  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = task.text;

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-task";
  deleteButton.type = "button";
  deleteButton.innerHTML = "&times;";
  deleteButton.setAttribute("aria-label", `Delete ${task.text}`);

  checkbox.addEventListener("change", () => toggleTask(task.id));
  deleteButton.addEventListener("click", () => deleteTask(task.id));

  item.append(checkbox, text, deleteButton);
  return item;
}

function render() {
  taskList.replaceChildren(...state.tasks.map(createTaskElement));
  titleInput.value = state.title;

  const remaining = state.tasks.filter((task) => !task.completed).length;
  const total = state.tasks.length;
  taskCount.textContent = total === 1 ? `${remaining} of 1 task left` : `${remaining} of ${total} tasks left`;
  emptyState.hidden = total > 0;
}

function addTask(text) {
  state.tasks.unshift({
    id: crypto.randomUUID(),
    text,
    completed: false,
  });
  saveState();
  render();
}

function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;

  task.completed = !task.completed;
  saveState();
  render();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((task) => task.id !== id);
  saveState();
  render();
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;

  addTask(text);
  taskForm.reset();
  taskInput.focus();
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
