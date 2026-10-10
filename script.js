const STORAGE_KEY = "todo-list-mvp";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const titleInput = document.querySelector("#list-title");
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
let pointerDrag = null;
const taskLayoutAnimations = new WeakMap();

function dueDateValue(item) {
  return Date.UTC(item.date.year, item.date.month - 1, item.date.day);
}

function sortByDueDate(items) {
  return [...items].sort((first, second) => dueDateValue(first) - dueDateValue(second));
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
        tasks: orderMode === "date" ? sortByDueDate(tasks) : tasks,
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

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date.year, date.month - 1, date.day));
}

function createTaskElement(todo, index) {
  const item = document.createElement("li");
  item.className = `task-item${todo.completed ? " completed" : ""}`;
  item.dataset.index = String(index);

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
  const date = document.createElement("time");
  date.className = "task-date";
  date.dateTime = toIsoDate(todo.date);
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

  dragHandle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const destination = index + (event.key === "ArrowUp" ? -1 : 1);
    if (destination < 0 || destination >= state.tasks.length) return;
    moveTaskToIndex(index, destination);
  });
  dragHandle.addEventListener("pointerdown", (event) => beginPointerDrag(event, item, index, dragHandle));
  dragHandle.addEventListener("lostpointercapture", (event) => {
    if (pointerDrag?.pointerId === event.pointerId && !pointerDrag.settling) cancelPointerDrag(event);
  });

  checkbox.addEventListener("change", () => {
    state.tasks[index].completed = checkbox.checked;
    saveState();
    renderTasks();
  });
  deleteButton.addEventListener("click", () => {
    state.tasks.splice(index, 1);
    saveState();
    renderTasks();
  });

  content.append(date, text);
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

function getPlaceholderIndex() {
  if (!pointerDrag?.placeholder) return -1;
  let index = 0;
  for (const child of taskList.children) {
    if (child === pointerDrag.placeholder) return index;
    if (child.classList.contains("task-item") && !child.classList.contains("drag-source")) index += 1;
  }
  return index;
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
  const items = [...taskList.querySelectorAll(".task-item:not(.drag-source)")];
  let destination = items.length;
  for (let index = 0; index < items.length; index += 1) {
    const rect = items[index].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      destination = index;
      break;
    }
  }
  if (destination === getPlaceholderIndex()) return;

  const previousPositions = captureTaskPositions();
  if (destination === items.length) taskList.append(drag.placeholder);
  else taskList.insertBefore(drag.placeholder, items[destination]);
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
  const destination = getPlaceholderIndex();
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
  taskList.replaceChildren(...state.tasks.map(createTaskElement));
  titleInput.value = state.title;
  const remaining = state.tasks.filter((todo) => !todo.completed).length;
  const total = state.tasks.length;
  taskCount.textContent = total === 1 ? `${remaining} of 1 task left` : `${remaining} of ${total} tasks left`;
  emptyState.hidden = total > 0;
}

function setStatus(message, type = "idle") {
  formStatus.textContent = message;
  formStatus.className = `form-status ${type}`;
  statusIndicator.className = `status-indicator ${type}`;
}

function setProcessing(active) {
  isProcessing = active;
  askButton.disabled = active || recordingPhase !== "idle";
  recordButton.disabled = active || recordingPhase === "starting" || recordingPhase === "stopping" || !SpeechRecognition;
  languageSelect.disabled = active || recordingPhase !== "idle";
  taskInput.disabled = active;
  askButton.textContent = active ? "Processing…" : "Ask AI";
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
  fields.append(emoji, titleLabel, dateLabel, remove);
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
}

async function processInput(input, source) {
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
  document.body.classList.toggle("recording", recording);
  recordButton.setAttribute("aria-pressed", String(recording));
  recordButton.setAttribute("aria-label", recording ? "Stop voice recording" : "Start voice recording");
  cancelRecordingButton.hidden = !recording;
  recordButton.disabled = isProcessing || recordingPhase === "starting" || recordingPhase === "stopping" || !SpeechRecognition;
  askButton.disabled = isProcessing || recordingPhase !== "idle";
  languageSelect.disabled = isProcessing || recordingPhase !== "idle";
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
  const ambiguousIndex = previewTasks.findIndex((item) => item.dateAmbiguous);
  if (ambiguousIndex !== -1) {
    setStatus("Confirm every ambiguous date before saving.", "warning");
    previewList.querySelectorAll(".confirm-date")[0]?.focus();
    return;
  }

  const savedTasks = sortByDueDate(previewTasks.map((item) => normalizeTask({
    date: item.date,
    task: `${item.emoji} ${item.title.trim()}`,
    completed: false,
  })));
  state.tasks = state.orderMode === "manual"
    ? [...state.tasks, ...savedTasks]
    : sortByDueDate([...state.tasks, ...savedTasks]);
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
  taskInput.focus();
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
renderTasks();
renderPreview();
updateRecordingControls();
