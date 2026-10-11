const STORAGE_KEY = "todo-list-mvp";
const APPEARANCE_KEY = "todo-appearance";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const systemDarkMode = window.matchMedia("(prefers-color-scheme: dark)");

const titleInput = document.querySelector("#list-title");
const todoCard = document.querySelector(".todo-card");
const composerRegion = document.querySelector("#composer-region");
const toggleComposerButton = document.querySelector("#toggle-composer");
const appearanceSelect = document.querySelector("#appearance-select");
const shareButton = document.querySelector("#share-list");
const shareButtonLabel = shareButton.querySelector("span");
const copyButton = document.querySelector("#copy-list");
const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const askButton = document.querySelector("#add-task-button");
const languageSelect = document.querySelector("#speech-language");
const recordButton = document.querySelector("#record-button");
const cancelRecordingButton = document.querySelector("#cancel-recording");
const recordingTimer = document.querySelector("#recording-timer");
const waveform = document.querySelector("#voice-waveform");
const formStatus = document.querySelector("#form-status");
const statusIndicator = document.querySelector("#status-indicator");
const retryButton = document.querySelector("#retry-processing");
const previewSection = document.querySelector("#preview-section");
const previewList = document.querySelector("#preview-list");
const savePreviewButton = document.querySelector("#save-preview");
const discardPreviewButton = document.querySelector("#discard-preview");
const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const emptyState = document.querySelector("#empty-state");
const pageNotice = document.querySelector("#page-notice");

let state = loadState();
let previewTasks = [];
let pendingProcessing = null;
let recognition;
let mediaStream;
let audioContext;
let analyser;
let animationFrame;
let timerInterval;
let recordingStartedAt = 0;
let recordingPhase = "idle";
let cancelRequested = false;
let recognitionError = "";
let finalTranscript = "";
let interimTranscript = "";
let isProcessing = false;
let isTextComposing = false;
let voiceSubmissionStarted = false;
let isExporting = false;
let noticeTimer;
let noticeHideTimer;
let copyResetTimer;
let pointerDrag = null;
let composerOpen = state.tasks.length === 0;
let appearanceMode = loadAppearance();
const taskLayoutAnimations = new WeakMap();

function dueDateValue(item) {
  return Date.UTC(item.date.year, item.date.month - 1, item.date.day);
}

function sortByDueDate(items) {
  return [...items].sort((first, second) => dueDateValue(first) - dueDateValue(second));
}

function inferLegacySubject(taskText) {
  const text = String(taskText).toLowerCase();
  if (/english\s+(literature|lit)|novel|poem|poetry|shakespeare|literary/.test(text)) return "English Literature";
  if (/english\s+(language|grammar|vocabulary)|grammar|vocabulary/.test(text)) return "English Language";
  const subjects = [
    ["Computer Science", /computer science|coding|programming|software/],
    ["Mathematics", /mathematics|maths?|algebra|geometry|calculus/],
    ["History", /history|historical/],
    ["Physics", /physics/],
    ["Chemistry", /chemistry/],
    ["Biology", /biology/],
    ["Chinese", /chinese|mandarin/],
    ["Geography", /geography/],
    ["Art", /\bart\b|drawing|painting/],
    ["Music", /music/],
  ];
  return subjects.find(([, pattern]) => pattern.test(text))?.[0] || "General";
}

function normalizeSubject(value, taskText = "") {
  const subject = String(value || "").trim().replace(/\s+/g, " ");
  return subject || inferLegacySubject(taskText);
}

function taskGroupKey(task) {
  return JSON.stringify([toIsoDate(task.date), task.subject]);
}

function groupTasks(items) {
  const dates = new Map();
  items.forEach((task, index) => {
    const dateKey = toIsoDate(task.date);
    if (!dates.has(dateKey)) dates.set(dateKey, { date: task.date, subjects: new Map() });
    const dateGroup = dates.get(dateKey);
    if (!dateGroup.subjects.has(task.subject)) dateGroup.subjects.set(task.subject, []);
    dateGroup.subjects.get(task.subject).push({ task, index });
  });
  return [...dates.values()].map((dateGroup) => ({
    date: dateGroup.date,
    subjects: [...dateGroup.subjects].map(([subject, tasks]) => ({ subject, tasks })),
  }));
}

function flattenGroups(items) {
  return groupTasks(items).flatMap((dateGroup) =>
    dateGroup.subjects.flatMap((subjectGroup) => subjectGroup.tasks.map(({ task }) => task)),
  );
}

function normalizeTask(task) {
  const now = new Date();
  const date = task.date || {
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };

  return {
    date: {
      day: Number(date.day),
      month: Number(date.month),
      year: Number(date.year),
    },
    task: String(task.task ?? task.text ?? "Untitled task"),
    subject: normalizeSubject(task.subject, task.task ?? task.text),
    completed: Boolean(task.completed),
  };
}

function loadState() {
  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (savedState && Array.isArray(savedState.tasks)) {
      const orderMode = savedState.orderMode === "manual" ? "manual" : "date";
      const tasks = savedState.tasks.map(normalizeTask);
      return {
        title: savedState.title || "Today’s focus",
        tasks: flattenGroups(orderMode === "date" ? sortByDueDate(tasks) : tasks),
        orderMode,
      };
    }
  } catch (error) {
    console.warn("The saved todo list could not be loaded.", error);
  }
  return { title: "Today’s focus", tasks: [], orderMode: "date" };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadAppearance() {
  try {
    const saved = localStorage.getItem(APPEARANCE_KEY);
    if (["light", "dark", "system"].includes(saved)) return saved;
  } catch (error) {
    console.warn("The appearance preference could not be loaded.", error);
  }
  return "system";
}

function applyAppearance() {
  const resolved = appearanceMode === "system"
    ? (systemDarkMode.matches ? "dark" : "light")
    : appearanceMode;
  document.documentElement.dataset.appearance = appearanceMode;
  document.documentElement.dataset.theme = resolved;
  appearanceSelect.value = appearanceMode;
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date.year, date.month - 1, date.day));
}

function createDateHeading(date) {
  const item = document.createElement("li");
  item.className = "task-date-heading";
  const time = document.createElement("time");
  time.dateTime = toIsoDate(date);
  time.textContent = formatDate(date);
  item.append(time);
  return item;
}

function createSubjectHeading(subject) {
  const item = document.createElement("li");
  item.className = "task-subject-heading";
  item.textContent = subject;
  return item;
}

function createTaskElement(todo, index) {
  const item = document.createElement("li");
  item.className = `task-item${todo.completed ? " completed" : ""}`;
  item.dataset.index = String(index);
  item.dataset.group = taskGroupKey(todo);

  const dragHandle = document.createElement("button");
  dragHandle.className = "drag-handle";
  dragHandle.type = "button";
  dragHandle.innerHTML = "<span aria-hidden=\"true\">⠿</span>";
  dragHandle.setAttribute("aria-label", `Drag ${todo.task} to reorder`);
  dragHandle.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown");
  dragHandle.title = "Drag to reorder. Use the arrow keys for keyboard reordering.";

  const checkbox = document.createElement("input");
  checkbox.className = "task-checkbox";
  checkbox.type = "checkbox";
  checkbox.checked = todo.completed;
  checkbox.setAttribute("aria-label", `Mark ${todo.task} as complete`);

  const content = document.createElement("div");
  content.className = "task-content";
  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = todo.task;

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-task";
  deleteButton.type = "button";
  deleteButton.innerHTML = "&times;";
  deleteButton.setAttribute("aria-label", `Delete ${todo.task}`);
  deleteButton.title = "Delete task";

  dragHandle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const groupIndices = state.tasks
      .map((task, taskIndex) => ({ task, taskIndex }))
      .filter(({ task }) => taskGroupKey(task) === taskGroupKey(todo))
      .map(({ taskIndex }) => taskIndex);
    const groupPosition = groupIndices.indexOf(index);
    const destinationPosition = groupPosition + (event.key === "ArrowUp" ? -1 : 1);
    if (destinationPosition < 0 || destinationPosition >= groupIndices.length) return;
    const destination = groupIndices[destinationPosition];
    moveTaskToIndex(index, destination);
  });
  dragHandle.addEventListener("pointerdown", (event) => beginPointerDrag(event, item, index, dragHandle));
  dragHandle.addEventListener("lostpointercapture", (event) => {
    if (pointerDrag?.pointerId === event.pointerId && !pointerDrag.settling) cancelPointerDrag(event);
  });

  checkbox.addEventListener("change", () => {
    const wasFullyCompleted = state.tasks.length > 0 && state.tasks.every((task) => task.completed);
    state.tasks[index].completed = checkbox.checked;
    const isFullyCompleted = state.tasks.length > 0 && state.tasks.every((task) => task.completed);
    saveState();
    renderTasks();
    if (!wasFullyCompleted && isFullyCompleted) celebrateCompletion();
  });
  deleteButton.addEventListener("click", () => {
    state.tasks.splice(index, 1);
    saveState();
    renderTasks();
  });

  content.append(text);
  item.append(dragHandle, checkbox, content, deleteButton);
  return item;
}

function saveManualOrder(focusIndex) {
  state.orderMode = "manual";
  saveState();
  renderTasks();
  setStatus("Task order updated. Your manual order will be preserved.", "success");
  requestAnimationFrame(() => {
    taskList.querySelector(`.task-item[data-index="${focusIndex}"] .drag-handle`)?.focus();
  });
}

function moveTaskToIndex(fromIndex, destination) {
  if (fromIndex === destination) return;
  const [task] = state.tasks.splice(fromIndex, 1);
  state.tasks.splice(destination, 0, task);
  saveManualOrder(destination);
}

function beginPointerDrag(event, source, fromIndex, handle) {
  if (event.button !== 0 || pointerDrag) return;
  event.preventDefault();
  handle.focus({ preventScroll: true });
  handle.setPointerCapture(event.pointerId);
  pointerDrag = {
    pointerId: event.pointerId,
    source,
    handle,
    fromIndex,
    groupKey: source.dataset.group,
    destination: fromIndex,
    startX: event.clientX,
    startY: event.clientY,
    clientX: event.clientX,
    clientY: event.clientY,
    active: false,
    settling: false,
  };
}

function activatePointerDrag(drag) {
  const origin = drag.source.getBoundingClientRect();
  const placeholder = document.createElement("li");
  placeholder.className = "task-placeholder";
  placeholder.style.height = `${origin.height}px`;
  placeholder.setAttribute("aria-hidden", "true");

  const ghost = drag.source.cloneNode(true);
  ghost.classList.remove("completed");
  if (drag.source.classList.contains("completed")) ghost.classList.add("completed");
  ghost.classList.add("drag-ghost");
  ghost.removeAttribute("data-index");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  Object.assign(ghost.style, {
    left: `${origin.left}px`,
    top: `${origin.top}px`,
    width: `${origin.width}px`,
    height: `${origin.height}px`,
  });

  drag.source.before(placeholder);
  drag.source.classList.add("drag-source");
  document.body.append(ghost);
  document.body.classList.add("is-reordering");
  Object.assign(drag, { active: true, origin, placeholder, ghost });
}

function updatePointerDrag(event) {
  const drag = pointerDrag;
  if (!drag || drag.pointerId !== event.pointerId || drag.settling) return;
  event.preventDefault();
  drag.clientX = event.clientX;
  drag.clientY = event.clientY;

  if (!drag.active) {
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance < 4) return;
    activatePointerDrag(drag);
  }

  const offsetX = event.clientX - drag.startX;
  const offsetY = event.clientY - drag.startY;
  drag.ghost.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) rotate(0.7deg) scale(1.015)`;
  movePlaceholderToPointer(event.clientY);

  const scrollEdge = 72;
  if (event.clientY < scrollEdge) window.scrollBy(0, -12);
  else if (event.clientY > window.innerHeight - scrollEdge) window.scrollBy(0, 12);
}

function captureTaskPositions() {
  return new Map(
    [...taskList.querySelectorAll(".task-item:not(.drag-source)")]
      .map((item) => [item, item.getBoundingClientRect().top]),
  );
}

function animateTaskPositions(previousPositions) {
  if (prefersReducedMotion) return;
  previousPositions.forEach((previousTop, item) => {
    const distance = previousTop - item.getBoundingClientRect().top;
    if (!distance) return;
    taskLayoutAnimations.get(item)?.cancel();
    const animation = item.animate(
      [{ transform: `translateY(${distance}px)` }, { transform: "translateY(0)" }],
      { duration: 190, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
    taskLayoutAnimations.set(item, animation);
  });
}

function movePlaceholderToPointer(clientY) {
  const drag = pointerDrag;
  if (!drag?.active) return;
  const items = [...taskList.querySelectorAll(".task-item:not(.drag-source)")]
    .filter((item) => item.dataset.group === drag.groupKey);
  if (items.length === 0) {
    drag.destination = drag.fromIndex;
    return;
  }
  let destination = items.length;
  for (let index = 0; index < items.length; index += 1) {
    const rect = items[index].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      destination = index;
      break;
    }
  }
  const previousPositions = captureTaskPositions();
  if (destination === items.length) {
    items.at(-1)?.after(drag.placeholder);
    const lastIndex = Number(items.at(-1)?.dataset.index ?? drag.fromIndex);
    drag.destination = drag.fromIndex < lastIndex ? lastIndex : lastIndex + 1;
  } else {
    const targetIndex = Number(items[destination].dataset.index);
    drag.destination = drag.fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
    taskList.insertBefore(drag.placeholder, items[destination]);
  }
  animateTaskPositions(previousPositions);
}

function cleanUpPointerDrag(drag) {
  drag.ghost?.remove();
  drag.placeholder?.remove();
  drag.source.classList.remove("drag-source");
  document.body.classList.remove("is-reordering");
  pointerDrag = null;
}

function finishPointerDrag(event) {
  const drag = pointerDrag;
  if (!drag || drag.pointerId !== event.pointerId || drag.settling) return;
  event.preventDefault();
  if (!drag.active) {
    pointerDrag = null;
    return;
  }

  drag.settling = true;
  const destination = drag.destination;
  const target = drag.placeholder.getBoundingClientRect();
  drag.ghost.classList.add("settling");
  drag.ghost.getBoundingClientRect();
  drag.ghost.style.transform = `translate3d(${target.left - drag.origin.left}px, ${target.top - drag.origin.top}px, 0) rotate(0deg) scale(1)`;

  window.setTimeout(() => {
    const fromIndex = drag.fromIndex;
    cleanUpPointerDrag(drag);
    if (destination !== fromIndex) moveTaskToIndex(fromIndex, destination);
  }, prefersReducedMotion ? 0 : 190);
}

function cancelPointerDrag(event) {
  const drag = pointerDrag;
  if (!drag || (event?.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
  cleanUpPointerDrag(drag);
}

function renderTasks() {
  const content = [];
  groupTasks(state.tasks).forEach((dateGroup) => {
    content.push(createDateHeading(dateGroup.date));
    dateGroup.subjects.forEach((subjectGroup) => {
      content.push(createSubjectHeading(subjectGroup.subject));
      subjectGroup.tasks.forEach(({ task, index }) => content.push(createTaskElement(task, index)));
    });
  });
  taskList.replaceChildren(...content);
  titleInput.value = state.title;
  const remaining = state.tasks.filter((todo) => !todo.completed).length;
  const total = state.tasks.length;
  taskCount.textContent = total === 1 ? `${remaining} of 1 task left` : `${remaining} of ${total} tasks left`;
  emptyState.hidden = total > 0;
  copyButton.hidden = total === 0;
  shareButton.disabled = total === 0 || isExporting;
  if (total === 0 && !composerOpen) setComposerOpen(true, { focus: true });
  updateComposerToggle();
}

function showPageNotice(message, type = "success", duration = 2400) {
  clearTimeout(noticeTimer);
  clearTimeout(noticeHideTimer);
  pageNotice.textContent = message;
  pageNotice.className = `page-notice visible ${type}`;
  pageNotice.hidden = false;
  noticeTimer = window.setTimeout(() => {
    pageNotice.classList.remove("visible");
    noticeHideTimer = window.setTimeout(() => { pageNotice.hidden = true; }, prefersReducedMotion ? 0 : 180);
  }, duration);
}

function celebrateCompletion() {
  showPageNotice(
    prefersReducedMotion ? "All tasks completed. Nice work!" : "All done — nice work! 🎉",
    "completion",
    2300,
  );
  if (prefersReducedMotion) return;

  const layer = document.createElement("canvas");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");
  const context = layer.getContext("2d");
  if (!context) return;

  const colors = ["#ea6847", "#23836c", "#f4ba55", "#75a7e8", "#c276d8"];
  document.body.append(layer);

  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;
  let scale = Math.min(window.devicePixelRatio || 1, 2);
  const resizeLayer = () => {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    scale = Math.min(window.devicePixelRatio || 1, 2);
    layer.width = Math.round(viewportWidth * scale);
    layer.height = Math.round(viewportHeight * scale);
    layer.style.width = `${viewportWidth}px`;
    layer.style.height = `${viewportHeight}px`;
  };
  resizeLayer();
  window.addEventListener("resize", resizeLayer);

  const originY = Math.min(viewportHeight * 0.34, 290);
  const particles = Array.from({ length: 82 }, (_, index) => {
    const direction = index % 2 === 0 ? -1 : 1;
    return {
      x: viewportWidth / 2 + direction * (18 + Math.random() * 58),
      y: originY + Math.random() * 22,
      velocityX: direction * (1.4 + Math.random() * 4.8) + (Math.random() - 0.5) * 1.4,
      velocityY: -(7.4 + Math.random() * 5.2),
      gravity: 0.105 + Math.random() * 0.055,
      drag: 0.986 + Math.random() * 0.008,
      width: 6 + Math.random() * 7,
      height: 10 + Math.random() * 10,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.34,
      flutterOffset: Math.random() * Math.PI * 2,
      color: colors[index % colors.length],
      opacity: 1,
    };
  });

  let previousTime = performance.now();
  const startTime = previousTime;
  const animate = (time) => {
    const step = Math.min((time - previousTime) / 16.67, 2.2);
    previousTime = time;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, viewportWidth, viewportHeight);

    let visibleParticles = 0;
    particles.forEach((particle) => {
      particle.velocityX *= particle.drag ** step;
      particle.velocityY += particle.gravity * step;
      particle.x += particle.velocityX * step;
      particle.x += Math.sin(time * 0.006 + particle.flutterOffset) * 0.18 * step;
      particle.y += particle.velocityY * step;
      particle.rotation += particle.rotationSpeed * step;
      particle.opacity = particle.y > viewportHeight * 0.82
        ? Math.max(0, (viewportHeight + 40 - particle.y) / (viewportHeight * 0.18 + 40))
        : 1;

      if (particle.y < viewportHeight + 50 && particle.opacity > 0) visibleParticles += 1;
      context.save();
      context.globalAlpha = particle.opacity;
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.scale(1, Math.cos(particle.rotation * 1.7));
      context.fillStyle = particle.color;
      context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
      context.restore();
    });

    if (visibleParticles > 0 && time - startTime < 6000) {
      requestAnimationFrame(animate);
    } else {
      window.removeEventListener("resize", resizeLayer);
      layer.remove();
    }
  };
  requestAnimationFrame(animate);
}

function buildPlainTextList() {
  const lines = [state.title.trim() || "Today’s focus", ""];
  groupTasks(state.tasks).forEach((dateGroup) => {
    dateGroup.subjects.forEach((subjectGroup) => {
      subjectGroup.tasks.forEach(({ task }) => lines.push(task.task));
    });
  });
  return lines.join("\n");
}

function fallbackCopyText(text) {
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Clipboard copy was rejected.");
}

async function copyTodoList() {
  if (state.tasks.length === 0) return;
  try {
    const text = buildPlainTextList();
    if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(text);
    else fallbackCopyText(text);
    clearTimeout(copyResetTimer);
    copyButton.textContent = "Copied!";
    copyButton.classList.add("copied");
    copyResetTimer = window.setTimeout(() => {
      copyButton.textContent = "Copy";
      copyButton.classList.remove("copied");
    }, 1800);
  } catch (error) {
    console.error(error);
    showPageNotice("The list could not be copied. Please try again.", "error", 3000);
  }
}

function wrapCanvasText(context, text, maximumWidth) {
  const lines = [];
  let line = "";
  for (const character of String(text)) {
    if (character === "\n") {
      lines.push(line.trimEnd());
      line = "";
      continue;
    }
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maximumWidth) {
      lines.push(line.trimEnd());
      line = character.trimStart();
    } else {
      line = candidate;
    }
  }
  if (line || lines.length === 0) lines.push(line.trimEnd());
  return lines;
}

function roundedRectangle(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function createTodoImageBlob(snapshot) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not supported in this browser.");
  const width = 1200;
  const padding = 82;
  const contentWidth = width - padding * 2;
  const taskTextWidth = contentWidth - 112;

  context.font = '700 64px Georgia, "Times New Roman", serif';
  const titleLines = wrapCanvasText(context, snapshot.title, contentWidth);
  context.font = '500 34px Arial, "Helvetica Neue", sans-serif';
  const preparedTasks = snapshot.tasks.map((task) => {
    const lines = wrapCanvasText(context, task.task, taskTextWidth);
    return { task, lines, height: Math.max(112, 58 + lines.length * 45) };
  });
  const titleHeight = titleLines.length * 76;
  const tasksHeight = preparedTasks.reduce((sum, item) => sum + item.height, 0);
  const height = Math.max(720, padding + 42 + titleHeight + 84 + tasksHeight + 90);
  canvas.width = width;
  canvas.height = height;

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#fffdf7");
  background.addColorStop(1, "#f4efe3");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#c7482b";
  context.font = '700 22px Arial, "Helvetica Neue", sans-serif';
  context.fillText("YOUR DAY, CLEARLY PLANNED", padding, padding);

  let y = padding + 76;
  context.fillStyle = "#172126";
  context.font = '700 64px Georgia, "Times New Roman", serif';
  titleLines.forEach((line) => {
    context.fillText(line, padding, y);
    y += 76;
  });

  context.fillStyle = "#6c777b";
  context.font = '600 24px Arial, "Helvetica Neue", sans-serif';
  context.fillText(`${snapshot.tasks.length} ${snapshot.tasks.length === 1 ? "task" : "tasks"} to do`, padding, y + 8);
  y += 58;

  preparedTasks.forEach(({ task, lines, height: rowHeight }) => {
    context.strokeStyle = "#dfe4df";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(width - padding, y);
    context.stroke();

    const checkboxX = padding + 2;
    const checkboxY = y + 40;
    roundedRectangle(context, checkboxX, checkboxY, 34, 34, 8);
    context.fillStyle = "#ffffff";
    context.fill();
    context.strokeStyle = "#aeb7b4";
    context.lineWidth = 3;
    context.stroke();

    const textX = padding + 70;
    context.fillStyle = "#c7482b";
    context.font = '700 20px Arial, "Helvetica Neue", sans-serif';
    context.fillText(formatDate(task.date).toUpperCase(), textX, y + 34);
    context.font = '500 34px Arial, "Helvetica Neue", sans-serif';
    context.fillStyle = "#172126";
    let lineY = y + 80;
    lines.forEach((line) => {
      context.fillText(line, textX, lineY);
      lineY += 45;
    });
    y += rowHeight;
  });

  context.strokeStyle = "#dfe4df";
  context.beginPath();
  context.moveTo(padding, y);
  context.lineTo(width - padding, y);
  context.stroke();
  context.fillStyle = "#6c777b";
  context.font = '500 20px Arial, "Helvetica Neue", sans-serif';
  context.fillText("AI Todo List · Version 2.3", padding, y + 48);

  const dataUrl = canvas.toDataURL("image/png");
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("The browser did not generate a PNG image.");
  }
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "image/png" });
}

function safeImageFilename(title = state.title) {
  const cleanTitle = (title.trim() || "Todo List")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
  return `${cleanTitle || "Todo List"}.png`;
}

function downloadImageBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const download = document.createElement("a");
  download.href = url;
  download.download = filename;
  download.style.display = "none";
  document.body.append(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function validatePngBlob(blob) {
  if (!(blob instanceof Blob) || blob.type !== "image/png" || blob.size < 100) {
    throw new Error("The generated file is not a valid PNG image.");
  }

  const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const expected = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!expected.every((byte, index) => signature[index] === byte)) {
    throw new Error("The generated image has an invalid PNG signature.");
  }

  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(blob);
    const isUsable = bitmap.width > 0 && bitmap.height > 0;
    bitmap.close();
    if (!isUsable) throw new Error("The generated PNG image could not be decoded.");
  }
}

async function exportTodoList() {
  if (state.tasks.length === 0 || isExporting) return;
  isExporting = true;
  renderTasks();
  shareButtonLabel.textContent = "Saving…";
  const snapshot = {
    title: state.title.trim() || "Today’s focus",
    tasks: state.tasks.map((task) => ({
      task: task.task,
      date: { ...task.date },
    })),
  };
  const filename = safeImageFilename(snapshot.title);
  let blob;
  try {
    blob = createTodoImageBlob(snapshot);
  } catch (error) {
    console.error(error);
    showPageNotice("The PNG image could not be created. Please try again.", "error", 3200);
    isExporting = false;
    shareButtonLabel.textContent = "Share as PNG";
    renderTasks();
    return;
  }
  try {
    await validatePngBlob(blob);
    downloadImageBlob(blob, filename);
    showPageNotice(`PNG download started: ${filename}`, "success");
  } catch (error) {
    console.error(error);
    showPageNotice("The image could not be saved. Please try again.", "error", 3200);
  } finally {
    isExporting = false;
    shareButtonLabel.textContent = "Share as PNG";
    renderTasks();
  }
}

function resizeTaskInput() {
  taskInput.style.height = "auto";
  const maximumHeight = Number.parseFloat(getComputedStyle(taskInput).maxHeight);
  const nextHeight = Math.min(taskInput.scrollHeight, maximumHeight);
  taskInput.style.height = `${nextHeight}px`;
  taskInput.style.overflowY = taskInput.scrollHeight > maximumHeight ? "auto" : "hidden";
}

function updateComposerToggle() {
  const hasTasks = state.tasks.length > 0;
  toggleComposerButton.hidden = !hasTasks;
  toggleComposerButton.textContent = composerOpen ? "Close input" : "Add tasks";
  toggleComposerButton.setAttribute("aria-expanded", String(composerOpen));
  toggleComposerButton.disabled = isProcessing || recordingPhase !== "idle" || previewTasks.length > 0;
}

function setComposerOpen(open, { focus = false } = {}) {
  composerOpen = state.tasks.length === 0 ? true : open;
  composerRegion.classList.toggle("collapsed", !composerOpen);
  todoCard.classList.toggle("composer-collapsed", !composerOpen);
  composerRegion.setAttribute("aria-hidden", String(!composerOpen));
  composerRegion.inert = !composerOpen;
  updateComposerToggle();
  if (composerOpen) {
    requestAnimationFrame(() => {
      resizeTaskInput();
      if (focus) taskInput.focus({ preventScroll: true });
    });
  }
}

function setStatus(message, type = "idle") {
  formStatus.textContent = message;
  formStatus.className = `form-status ${type}`;
  statusIndicator.className = `status-indicator ${type}`;
}

function setProcessing(active) {
  isProcessing = active;
  const reviewingPreview = previewTasks.length > 0;
  askButton.disabled = active || reviewingPreview || recordingPhase !== "idle";
  recordButton.disabled = active || reviewingPreview || recordingPhase === "starting" || recordingPhase === "stopping" || !SpeechRecognition;
  languageSelect.disabled = active || reviewingPreview || recordingPhase !== "idle";
  taskInput.disabled = active;
  askButton.textContent = active ? "Processing…" : "Ask AI";
  updateComposerToggle();
}

function toIsoDate(date) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function fromIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const parsed = new Date(date.year, date.month - 1, date.day);
  return parsed.getFullYear() === date.year && parsed.getMonth() === date.month - 1 && parsed.getDate() === date.day
    ? date
    : null;
}

function createPreviewElement(item, index) {
  const row = document.createElement("li");
  row.className = `preview-item${item.dateAmbiguous ? " ambiguous" : ""}`;

  const fields = document.createElement("div");
  fields.className = "preview-fields";
  const emoji = document.createElement("span");
  emoji.className = "preview-emoji";
  emoji.textContent = item.emoji;

  const titleLabel = document.createElement("label");
  titleLabel.className = "preview-field title-field";
  titleLabel.innerHTML = "<span>Task title</span>";
  const title = document.createElement("input");
  title.type = "text";
  title.maxLength = 200;
  title.value = item.title;
  title.addEventListener("input", () => { previewTasks[index].title = title.value; });
  titleLabel.append(title);

  const subjectLabel = document.createElement("label");
  subjectLabel.className = "preview-field subject-field";
  subjectLabel.innerHTML = "<span>Subject</span>";
  const subject = document.createElement("input");
  subject.type = "text";
  subject.maxLength = 80;
  subject.value = item.subject;
  subject.addEventListener("input", () => { previewTasks[index].subject = subject.value; });
  subjectLabel.append(subject);

  const dateLabel = document.createElement("label");
  dateLabel.className = "preview-field date-field";
  dateLabel.innerHTML = "<span>Due date</span>";
  const date = document.createElement("input");
  date.type = "date";
  date.value = toIsoDate(item.date);
  date.addEventListener("change", () => {
    const parsed = fromIsoDate(date.value);
    if (parsed) previewTasks[index].date = parsed;
  });
  dateLabel.append(date);

  const remove = document.createElement("button");
  remove.className = "remove-preview";
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    previewTasks.splice(index, 1);
    renderPreview();
  });
  fields.append(emoji, titleLabel, subjectLabel, dateLabel, remove);
  row.append(fields);

  if (item.dateAmbiguous) {
    const warning = document.createElement("div");
    warning.className = "date-warning";
    const message = document.createElement("p");
    message.textContent = item.dateQuestion || "This date is ambiguous. Check the due date before saving.";
    const confirm = document.createElement("button");
    confirm.className = "confirm-date";
    confirm.type = "button";
    confirm.textContent = "Confirm date";
    confirm.addEventListener("click", () => {
      const parsed = fromIsoDate(date.value);
      if (!parsed) {
        setStatus("Enter a valid due date before confirming it.", "error");
        date.focus();
        return;
      }
      previewTasks[index].date = parsed;
      previewTasks[index].dateAmbiguous = false;
      previewTasks[index].dateQuestion = "";
      renderPreview();
    });
    warning.append(message, confirm);
    row.append(warning);
  }
  return row;
}

function renderPreview() {
  previewSection.hidden = previewTasks.length === 0;
  previewList.replaceChildren(...previewTasks.map(createPreviewElement));
  const unresolved = previewTasks.filter((item) => item.dateAmbiguous).length;
  savePreviewButton.disabled = previewTasks.length === 0 || unresolved > 0;
  savePreviewButton.textContent = unresolved
    ? `Confirm ${unresolved} ambiguous ${unresolved === 1 ? "date" : "dates"} to save`
    : `Save ${previewTasks.length} ${previewTasks.length === 1 ? "task" : "tasks"}`;
  updateComposerToggle();
  updateRecordingControls();
}

async function processInput(input, source) {
  if (isProcessing) return;
  if (previewTasks.length > 0) {
    setStatus("Review or discard the current generated tasks before submitting another request.", "warning");
    return;
  }
  const cleanInput = input.trim();
  if (!cleanInput) {
    setStatus(source === "voice" ? "No speech was detected. Please try recording again." : "Enter at least one task.", "error");
    return;
  }
  if (cleanInput.length > 4000) {
    setStatus("Keep your request under 4,000 characters.", "error");
    return;
  }

  pendingProcessing = { input: cleanInput, source };
  retryButton.hidden = true;
  setProcessing(true);
  setStatus(source === "voice" ? "Transcription complete. DeepSeek is generating your tasks…" : "DeepSeek is generating your tasks…", "processing");

  try {
    const response = await fetch("/api/parse-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: cleanInput,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "DeepSeek could not process your tasks.");
    if (!Array.isArray(result.tasks) || result.tasks.length === 0) {
      throw new Error("No actionable tasks were found. Add a specific action and try again.");
    }
    previewTasks = sortByDueDate(result.tasks.map((item) => ({
      title: item.title,
      subject: normalizeSubject(item.subject, item.title),
      emoji: item.emoji,
      date: item.date,
      dateAmbiguous: Boolean(item.dateAmbiguous),
      dateQuestion: item.dateQuestion || "",
    })));
    renderPreview();
    const ambiguousCount = previewTasks.filter((item) => item.dateAmbiguous).length;
    setStatus(
      ambiguousCount
        ? `Review ${previewTasks.length} generated tasks and confirm ${ambiguousCount} ambiguous ${ambiguousCount === 1 ? "date" : "dates"}.`
        : `Review ${previewTasks.length} generated ${previewTasks.length === 1 ? "task" : "tasks"} before saving.`,
      ambiguousCount ? "warning" : "success",
    );
    previewSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    setStatus(error.message || "Task generation failed. Please try again.", "error");
    retryButton.hidden = false;
  } finally {
    setProcessing(false);
  }
}

function resizeWaveform() {
  const ratio = window.devicePixelRatio || 1;
  waveform.width = Math.round(waveform.clientWidth * ratio);
  waveform.height = Math.round(waveform.clientHeight * ratio);
}

function drawWaveform() {
  if (!analyser) return;
  const context = waveform.getContext("2d");
  const values = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(values);
  context.clearRect(0, 0, waveform.width, waveform.height);
  const gradient = context.createLinearGradient(0, 0, waveform.width, 0);
  gradient.addColorStop(0, "#229b81");
  gradient.addColorStop(0.5, "#ea6847");
  gradient.addColorStop(1, "#229b81");
  context.strokeStyle = gradient;
  context.lineWidth = Math.max(2, (window.devicePixelRatio || 1) * 1.2);
  context.beginPath();
  values.forEach((value, index) => {
    const x = index * waveform.width / values.length;
    const y = value / 128 * waveform.height / 2;
    index === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
  });
  context.stroke();
  animationFrame = requestAnimationFrame(drawWaveform);
}

function startTimer() {
  recordingStartedAt = Date.now();
  recordingTimer.textContent = "00:00";
  timerInterval = setInterval(() => {
    const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
    recordingTimer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }, 250);
}

function releaseMedia() {
  cancelAnimationFrame(animationFrame);
  clearInterval(timerInterval);
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = undefined;
  analyser = undefined;
  if (audioContext) audioContext.close().catch(() => {});
  audioContext = undefined;
  waveform.hidden = true;
  recordingTimer.hidden = true;
}

function appendTranscript(words) {
  const cleanWords = words.trim();
  if (!cleanWords) return;
  const lastCharacter = finalTranscript.trimEnd().slice(-1);
  const firstCharacter = cleanWords.charAt(0);
  const isCjk = (character) => /[\u3400-\u9fff\uf900-\ufaff]/.test(character);
  const separator = finalTranscript && !isCjk(lastCharacter) && !isCjk(firstCharacter) ? " " : "";
  finalTranscript = `${finalTranscript.trimEnd()}${separator}${cleanWords}`;
}

function updateRecordingControls() {
  const recording = recordingPhase === "recording";
  const reviewingPreview = previewTasks.length > 0;
  document.body.classList.toggle("recording", recording);
  recordButton.setAttribute("aria-pressed", String(recording));
  recordButton.setAttribute("aria-label", recording ? "Stop voice recording" : "Start voice recording");
  cancelRecordingButton.hidden = !recording;
  recordButton.disabled = isProcessing || reviewingPreview || recordingPhase === "starting" || recordingPhase === "stopping" || !SpeechRecognition;
  askButton.disabled = isProcessing || reviewingPreview || recordingPhase !== "idle";
  languageSelect.disabled = isProcessing || reviewingPreview || recordingPhase !== "idle";
}

function finishCanceledRecording() {
  recordingPhase = "idle";
  recognitionError = "";
  finalTranscript = "";
  interimTranscript = "";
  releaseMedia();
  updateRecordingControls();
  setStatus("Recording canceled. Nothing was submitted.", "idle");
}

async function finishTranscription() {
  if (voiceSubmissionStarted) return;
  releaseMedia();
  recordingPhase = "idle";
  updateRecordingControls();

  if (cancelRequested) {
    finishCanceledRecording();
    return;
  }
  if (recognitionError) {
    const availableTranscript = finalTranscript.trim() || interimTranscript.trim();
    pendingProcessing = availableTranscript ? { input: availableTranscript, source: "voice" } : null;
    retryButton.hidden = !pendingProcessing;
    setStatus(recognitionError, "error");
    return;
  }

  const transcript = finalTranscript.trim() || interimTranscript.trim();
  if (!transcript) {
    pendingProcessing = null;
    retryButton.hidden = true;
    setStatus("No speech was detected. Check your microphone and try again.", "error");
    return;
  }
  voiceSubmissionStarted = true;
  await processInput(transcript, "voice");
}

async function startRecording() {
  if (!SpeechRecognition) {
    setStatus("Voice input is not supported in this browser. Use the latest Google Chrome, or continue typing.", "error");
    return;
  }
  if (recordingPhase !== "idle" || isProcessing) return;

  recordingPhase = "starting";
  cancelRequested = false;
  voiceSubmissionStarted = false;
  recognitionError = "";
  finalTranscript = "";
  interimTranscript = "";
  retryButton.hidden = true;
  updateRecordingControls();
  setStatus("Requesting microphone access…", "processing");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageSelect.value;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const words = event.results[index][0].transcript;
        if (event.results[index].isFinal) appendTranscript(words);
        else interimTranscript += words;
      }
    };

    recognition.onerror = (event) => {
      if (cancelRequested || event.error === "aborted") return;
      if (event.error === "no-speech") {
        recognitionError = "No speech was detected. Check your microphone and try again.";
      } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        recognitionError = "Microphone or speech-recognition access was denied. Allow access in Chrome settings, then try again.";
      } else if (event.error === "network") {
        recognitionError = "Transcription failed because the speech service could not connect. Check your network and try again.";
      } else {
        recognitionError = `Transcription failed (${event.error.replaceAll("-", " ")}). You can retry without retyping any captured text.`;
      }
      recordingPhase = "stopping";
      updateRecordingControls();
    };

    recognition.onend = () => {
      if (cancelRequested) {
        cancelRequested = false;
        return;
      }
      if (recordingPhase === "recording" && !cancelRequested && !recognitionError) {
        interimTranscript = "";
        try {
          recognition.start();
          return;
        } catch {
          recognitionError = "Transcription stopped unexpectedly. You can retry without retyping any captured text.";
        }
      }
      finishTranscription();
    };

    recognition.start();
    recordingPhase = "recording";
    waveform.hidden = false;
    recordingTimer.hidden = false;
    resizeWaveform();
    drawWaveform();
    startTimer();
    updateRecordingControls();
    setStatus("Recording… Speak your tasks, then press the stop button.", "recording");
  } catch (error) {
    releaseMedia();
    recordingPhase = "idle";
    updateRecordingControls();
    setStatus(
      error.name === "NotAllowedError"
        ? "Microphone access was denied. Allow microphone access in Chrome settings, or continue typing."
        : "The microphone could not start. Check that it is connected and available, or continue typing.",
      "error",
    );
  }
}

function stopRecording() {
  if (recordingPhase !== "recording") return;
  recordingPhase = "stopping";
  updateRecordingControls();
  setStatus("Transcribing your recording…", "processing");
  try {
    recognition.stop();
  } catch {
    recognitionError = "Transcription could not finish. Please try recording again.";
    finishTranscription();
  }
}

function cancelRecording() {
  if (recordingPhase !== "recording") return;
  cancelRequested = true;
  recordingPhase = "idle";
  try { recognition.abort(); } catch { /* The recognizer may already be closing. */ }
  finishCanceledRecording();
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  processInput(taskInput.value, "typed");
});

taskInput.addEventListener("compositionstart", () => {
  isTextComposing = true;
});
taskInput.addEventListener("compositionend", () => {
  isTextComposing = false;
});
taskInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  if (event.isComposing || isTextComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!isProcessing && recordingPhase === "idle") taskForm.requestSubmit();
});

recordButton.addEventListener("click", () => {
  if (recordingPhase === "recording") stopRecording();
  else startRecording();
});
cancelRecordingButton.addEventListener("click", cancelRecording);

retryButton.addEventListener("click", () => {
  if (pendingProcessing) processInput(pendingProcessing.input, pendingProcessing.source);
});

savePreviewButton.addEventListener("click", () => {
  const emptyTitleIndex = previewTasks.findIndex((item) => !item.title.trim());
  if (emptyTitleIndex !== -1) {
    setStatus("Every task needs a title before saving.", "error");
    previewList.querySelectorAll(".title-field input")[emptyTitleIndex]?.focus();
    return;
  }
  const emptySubjectIndex = previewTasks.findIndex((item) => !item.subject.trim());
  if (emptySubjectIndex !== -1) {
    setStatus("Every task needs a subject before saving.", "error");
    previewList.querySelectorAll(".subject-field input")[emptySubjectIndex]?.focus();
    return;
  }
  const ambiguousIndex = previewTasks.findIndex((item) => item.dateAmbiguous);
  if (ambiguousIndex !== -1) {
    setStatus("Confirm every ambiguous date before saving.", "warning");
    previewList.querySelectorAll(".confirm-date")[0]?.focus();
    return;
  }

  const savedTasks = sortByDueDate(previewTasks.map((item) => normalizeTask({
    date: item.date,
    task: `${item.emoji} ${item.title.trim()}`,
    subject: item.subject,
    completed: false,
  })));
  const combinedTasks = state.orderMode === "manual"
    ? [...state.tasks, ...savedTasks]
    : sortByDueDate([...state.tasks, ...savedTasks]);
  state.tasks = flattenGroups(combinedTasks);
  saveState();
  renderTasks();
  const count = savedTasks.length;
  previewTasks = [];
  renderPreview();
  taskInput.value = "";
  pendingProcessing = null;
  finalTranscript = "";
  interimTranscript = "";
  retryButton.hidden = true;
  setStatus(`${count} ${count === 1 ? "task" : "tasks"} saved.`, "success");
  setComposerOpen(false);
  toggleComposerButton.focus({ preventScroll: true });
});

discardPreviewButton.addEventListener("click", () => {
  previewTasks = [];
  renderPreview();
  retryButton.hidden = !pendingProcessing;
  setStatus("Preview discarded. Your original input is still available.", "idle");
});

titleInput.addEventListener("input", () => {
  state.title = titleInput.value;
  saveState();
});
titleInput.addEventListener("blur", () => {
  if (!titleInput.value.trim()) {
    state.title = "Today’s focus";
    saveState();
    renderTasks();
  }
});

toggleComposerButton.addEventListener("click", () => {
  setComposerOpen(!composerOpen, { focus: !composerOpen });
});
let appearanceInputMethod = "keyboard";
appearanceSelect.addEventListener("pointerdown", () => {
  appearanceInputMethod = "pointer";
});
appearanceSelect.addEventListener("keydown", () => {
  appearanceInputMethod = "keyboard";
});
appearanceSelect.addEventListener("change", () => {
  appearanceMode = appearanceSelect.value;
  try {
    localStorage.setItem(APPEARANCE_KEY, appearanceMode);
  } catch (error) {
    console.warn("The appearance preference could not be saved.", error);
  }
  applyAppearance();
  if (appearanceInputMethod === "pointer") {
    requestAnimationFrame(() => appearanceSelect.blur());
  }
});
shareButton.addEventListener("click", exportTodoList);
copyButton.addEventListener("click", copyTodoList);
taskInput.addEventListener("input", resizeTaskInput);

const handleSystemAppearanceChange = () => {
  if (appearanceMode === "system") applyAppearance();
};
if (systemDarkMode.addEventListener) systemDarkMode.addEventListener("change", handleSystemAppearanceChange);
else systemDarkMode.addListener(handleSystemAppearanceChange);

window.addEventListener("resize", () => {
  if (recordingPhase === "recording") resizeWaveform();
});
window.addEventListener("pointermove", updatePointerDrag, { passive: false });
window.addEventListener("pointerup", finishPointerDrag);
window.addEventListener("pointercancel", cancelPointerDrag);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pointerDrag) cancelPointerDrag();
});
window.addEventListener("blur", () => cancelPointerDrag());
window.addEventListener("pagehide", () => {
  cancelPointerDrag();
  cancelRequested = true;
  try { recognition?.abort(); } catch { /* The page is closing. */ }
  releaseMedia();
});

if (!SpeechRecognition) {
  recordButton.disabled = true;
  setStatus("Voice input is not supported in this browser. Use the latest Google Chrome, or continue typing.", "warning");
}
applyAppearance();
renderTasks();
renderPreview();
updateRecordingControls();
setComposerOpen(state.tasks.length === 0);
resizeTaskInput();
