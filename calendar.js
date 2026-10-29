const TASK_STORAGE_KEY = "todo-list-mvp";
const EVENT_STORAGE_KEY = "todo-calendar-events";
const APPEARANCE_KEY = "todo-appearance";
const CALENDAR_VIEW_KEY = "todo-calendar-view-v2.5";
const systemDarkMode = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const stage = document.querySelector("#calendar-stage");
const periodLabel = document.querySelector("#period-label");
const previousButton = document.querySelector("#previous-period");
const nextButton = document.querySelector("#next-period");
const todayButton = document.querySelector("#today-button");
const previousYearButton = document.querySelector("#previous-year");
const nextYearButton = document.querySelector("#next-year");
const viewButtons = [...document.querySelectorAll("[data-view]")];
const addEventButton = document.querySelector("#add-event");
const calendarNotice = document.querySelector("#calendar-notice");
const appearanceSelect = document.querySelector("#appearance-select");

const eventDialog = document.querySelector("#event-dialog");
const eventEditor = document.querySelector("#event-editor");
const eventDialogTitle = document.querySelector("#event-dialog-title");
const eventEntryTabs = document.querySelector("#event-entry-tabs");
const naturalTab = document.querySelector("#natural-tab");
const manualTab = document.querySelector("#manual-tab");
const naturalPanel = document.querySelector("#natural-panel");
const eventDescription = document.querySelector("#event-description");
const interpretEventButton = document.querySelector("#interpret-event");
const eventAiStatus = document.querySelector("#event-ai-status");
const eventRecordButton = document.querySelector("#event-record-button");
const cancelEventRecordingButton = document.querySelector("#cancel-event-recording");
const eventRecordingTimer = document.querySelector("#event-recording-timer");
const eventVoiceWaveform = document.querySelector("#event-voice-waveform");
const eventPreview = document.querySelector("#event-preview");
const previewLabel = document.querySelector("#preview-label");
const eventPreviewSummary = document.querySelector("#event-preview-summary");
const eventDraftList = document.querySelector("#event-draft-list");
const addEventDraftButton = document.querySelector("#add-event-draft");
const singleEventFields = document.querySelector("#single-event-fields");
const eventClarification = document.querySelector("#event-clarification");
const eventQuestion = document.querySelector("#event-question");
const dateConfirmed = document.querySelector("#date-confirmed");
const eventTitle = document.querySelector("#event-title");
const eventStartDate = document.querySelector("#event-start-date");
const eventEndDate = document.querySelector("#event-end-date");
const eventHoliday = document.querySelector("#event-holiday");
const eventStartTime = document.querySelector("#event-start-time");
const eventEndTime = document.querySelector("#event-end-time");
const deleteEventButton = document.querySelector("#delete-event");
const saveEventButton = document.querySelector("#save-event");
const eventSaveStatus = document.querySelector("#event-save-status");

const taskDialog = document.querySelector("#task-dialog");
const taskEditor = document.querySelector("#task-editor");
const taskTitle = document.querySelector("#task-title");
const taskSubject = document.querySelector("#task-subject");
const taskLabel = document.querySelector("#task-label");
const taskDueDate = document.querySelector("#task-due-date");
const taskCompleted = document.querySelector("#task-completed");
const deleteTaskButton = document.querySelector("#delete-task");

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MIN_CALENDAR_YEAR = 2026;
const MAX_CALENDAR_YEAR = 2028;

let taskState = loadTaskState();
let events = loadEvents();
let selectedDate = startOfDay(new Date());
let calendarView = loadCalendarView();
let appearanceMode = loadAppearance();
let editingEventId = null;
let editingTaskIndex = null;
let needsDateConfirmation = false;
let noticeTimer;
let dateRefreshTimer;
let isEventDescriptionComposing = false;
let isInterpretingEvent = false;
let eventVoiceInput;
let eventDrafts = [];
const expandedTaskDates = new Set();
const dialogOpenTimers = new WeakMap();

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  next.setDate(Math.min(date.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
}

function addYears(date, amount) {
  const next = new Date(date.getFullYear() + amount, date.getMonth(), 1);
  next.setDate(Math.min(date.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
}

function startOfWeek(date) {
  return addDays(date, -date.getDay());
}

function startOfMondayWeek(date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function toIsoDate(date) {
  if (!date) return "";
  if (!(date instanceof Date)) {
    return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toIsoDate(date) === value ? date : null;
}

function dateObjectFromIso(value) {
  const date = parseIsoDate(value);
  return date ? { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() } : null;
}

function sameDate(first, second) {
  return toIsoDate(first) === toIsoDate(second);
}

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function normalizeTask(task) {
  const date = task?.date && Number.isFinite(Number(task.date.year)) ? {
    day: Number(task.date.day),
    month: Number(task.date.month),
    year: Number(task.date.year),
  } : null;
  return {
    ...task,
    task: String(task?.task ?? task?.text ?? "Untitled task"),
    subject: String(task?.subject || "General").trim() || "General",
    label: String(task?.label || "").trim().replace(/\s+/g, " ").slice(0, 40),
    date,
    completed: Boolean(task?.completed),
    completedOn: TodoTaskRules.normalizeCompletedOn(task?.completedOn),
  };
}

function loadTaskState() {
  try {
    const stored = JSON.parse(localStorage.getItem(TASK_STORAGE_KEY));
    if (stored && Array.isArray(stored.tasks)) {
      return {
        ...stored,
        title: stored.title || "Today’s focus",
        tasks: stored.tasks.map(normalizeTask),
      };
    }
  } catch (error) {
    console.warn("Tasks could not be loaded.", error);
  }
  return { title: "Today’s focus", tasks: [], orderMode: "date" };
}

function saveTaskState() {
  localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(taskState));
}

function normalizeEvent(event) {
  const startDate = parseIsoDate(event?.startDate) ? event.startDate : "";
  const endDate = parseIsoDate(event?.endDate) ? event.endDate : startDate;
  if (!startDate || !endDate || endDate < startDate) return null;
  const holiday = Boolean(event.holiday);
  const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
  const startTime = holiday || !validTime(event.startTime) ? "" : String(event.startTime);
  const endTime = startTime && validTime(event.endTime) ? String(event.endTime) : "";
  const allDay = holiday || !startTime;
  return {
    id: String(event.id || crypto.randomUUID()),
    title: String(event.title || "Untitled event").trim() || "Untitled event",
    startDate,
    endDate,
    allDay,
    holiday,
    startTime,
    endTime,
  };
}

function loadEvents() {
  try {
    const stored = JSON.parse(localStorage.getItem(EVENT_STORAGE_KEY));
    if (Array.isArray(stored)) return stored.map(normalizeEvent).filter(Boolean);
  } catch (error) {
    console.warn("Events could not be loaded.", error);
  }
  return [];
}

function saveEvents() {
  localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events));
}

function loadCalendarView() {
  try {
    const stored = localStorage.getItem(CALENDAR_VIEW_KEY);
    if (["day", "week", "month", "year"].includes(stored)) return stored;
  } catch { /* Keep month view. */ }
  return "month";
}

function loadAppearance() {
  try {
    const stored = localStorage.getItem(APPEARANCE_KEY);
    if (["light", "dark", "system"].includes(stored)) return stored;
  } catch { /* Keep system appearance. */ }
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

function announceAppearanceChange() {
  if (window.parent === window) return;
  window.parent.postMessage({ type: "todo-appearance-change", mode: appearanceMode }, location.origin);
}

function tasksOnDate(isoDate) {
  return taskState.tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.date && toIsoDate(task.date) === isoDate);
}

function eventsOnDate(isoDate) {
  return events.filter((event) => event.startDate <= isoDate && event.endDate >= isoDate);
}

function holidaysOnDate(isoDate) {
  return eventsOnDate(isoDate).filter((event) => event.holiday);
}

function countsForDate(date) {
  const isoDate = toIsoDate(date);
  return { tasks: tasksOnDate(isoDate).length, events: eventsOnDate(isoDate).length };
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

function localTodayIso() {
  return toIsoDate(new Date());
}

function isTaskOverdue(task) {
  return Boolean(task.date && !task.completed && String(task.label || "").trim().toLowerCase() !== "extra" && toIsoDate(task.date) < localTodayIso());
}

function formatClockTime(value) {
  const [hour, minute] = String(value).split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
    .format(new Date(2000, 0, 1, hour, minute));
}

function formatEventTiming(event) {
  if (event.allDay || !event.startTime) return "";
  const start = formatClockTime(event.startTime);
  return event.endTime ? `${start}–${formatClockTime(event.endTime)}` : start;
}

function sortTimedEvents(items) {
  return [...items].sort((first, second) => first.startTime.localeCompare(second.startTime));
}

function createDots(date) {
  const counts = countsForDate(date);
  const dots = document.createElement("span");
  dots.className = "date-dots";
  if (counts.tasks) {
    const taskDot = document.createElement("i");
    taskDot.className = "date-dot task-dot";
    taskDot.title = `${counts.tasks} ${counts.tasks === 1 ? "task" : "tasks"}`;
    dots.append(taskDot);
  }
  if (counts.events) {
    const eventDot = document.createElement("i");
    eventDot.className = "date-dot event-dot";
    eventDot.title = `${counts.events} ${counts.events === 1 ? "event" : "events"}`;
    dots.append(eventDot);
  }
  return { dots, counts };
}

function createCalendarItem(type, data, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `calendar-item ${type === "event" ? "event-item" : "task-calendar-item"}`;
  if (type === "event" && data.holiday) button.classList.add("holiday-event-item");
  if (type === "task" && data.completed) button.classList.add("completed-item");

  const symbol = document.createElement("span");
  symbol.className = "item-symbol";
  symbol.classList.add(type === "event" ? "is-event" : "is-task");
  if (type === "event" && data.holiday) symbol.classList.add("is-holiday");
  if (type === "task" && data.completed) symbol.classList.add("is-complete");
  const content = document.createElement("span");
  content.className = "calendar-item-content";
  const titleLine = document.createElement("span");
  titleLine.className = "calendar-item-title-line";
  const title = document.createElement("span");
  title.className = "item-title";
  title.textContent = type === "event" ? data.title : data.task;
  const meta = document.createElement("span");
  meta.className = "item-meta";
  if (type === "event") {
    const timing = formatEventTiming(data);
    meta.textContent = [data.holiday ? "Holiday" : "", timing].filter(Boolean).join(" · ");
  } else {
    meta.textContent = data.subject;
  }
  titleLine.append(title);
  content.append(titleLine);
  if (type === "task" && (data.completed || isTaskOverdue(data) || data.label)) {
    const badges = document.createElement("span");
    badges.className = "calendar-task-badges";
    if (data.completed || isTaskOverdue(data)) {
      const status = document.createElement("span");
      status.className = "calendar-status-badge";
      status.textContent = data.completed ? "Completed" : "Past Due";
      badges.append(status);
    }
    if (data.label) {
      const label = document.createElement("span");
      label.className = "calendar-label-badge";
      label.textContent = data.label;
      badges.append(label);
    }
    content.append(badges);
  }
  if (meta.textContent) content.append(meta);
  button.append(symbol, content);
  button.addEventListener("click", () => {
    if (type === "event") openEventDialog(data.id);
    else openTaskDialog(index);
  });
  return button;
}

function renderMonth() {
  periodLabel.textContent = `${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
  const fragment = document.createDocumentFragment();
  const weekdays = document.createElement("div");
  weekdays.className = "weekday-row";
  weekdayNames.forEach((name) => {
    const label = document.createElement("span");
    label.textContent = name;
    weekdays.append(label);
  });
  const grid = document.createElement("div");
  grid.className = "month-grid";
  const first = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const gridStart = startOfWeek(first);
  for (let offset = 0; offset < 42; offset += 1) {
    const date = addDays(gridStart, offset);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "month-day";
    if (date.getMonth() !== selectedDate.getMonth()) button.classList.add("outside-month");
    if (sameDate(date, new Date())) button.classList.add("is-today");
    if (sameDate(date, selectedDate)) button.classList.add("is-selected");
    if (holidaysOnDate(toIsoDate(date)).length) button.classList.add("holiday-day");
    else if (isWeekend(date)) button.classList.add("weekend-day");
    button.setAttribute("aria-label", `Open ${formatLongDate(date)} in Day view`);
    const number = document.createElement("span");
    number.className = "day-number";
    number.textContent = String(date.getDate());
    const { dots, counts } = createDots(date);
    button.append(number, dots);
    if (counts.tasks || counts.events) {
      const summary = document.createElement("span");
      summary.className = "date-summary";
      const parts = [];
      if (counts.tasks) parts.push(`${counts.tasks} ${counts.tasks === 1 ? "task" : "tasks"}`);
      if (counts.events) parts.push(`${counts.events} ${counts.events === 1 ? "event" : "events"}`);
      summary.textContent = parts.join(" · ");
      button.append(summary);
    }
    button.addEventListener("click", () => openDate(date));
    grid.append(button);
  }
  fragment.append(weekdays, grid);
  stage.replaceChildren(fragment);
}

function renderYear() {
  periodLabel.textContent = String(selectedDate.getFullYear());
  const grid = document.createElement("div");
  grid.className = "year-grid";
  for (let month = 0; month < 12; month += 1) {
    const monthCard = document.createElement("section");
    monthCard.className = "mini-month";
    const heading = document.createElement("h3");
    heading.textContent = monthNames[month];
    const weekdays = document.createElement("div");
    weekdays.className = "mini-weekdays";
    weekdayNames.forEach((name) => {
      const label = document.createElement("span");
      label.textContent = name.charAt(0);
      weekdays.append(label);
    });
    const days = document.createElement("div");
    days.className = "mini-month-grid";
    const first = new Date(selectedDate.getFullYear(), month, 1);
    for (let blank = 0; blank < first.getDay(); blank += 1) {
      const empty = document.createElement("span");
      empty.className = "mini-day empty";
      days.append(empty);
    }
    const totalDays = new Date(selectedDate.getFullYear(), month + 1, 0).getDate();
    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(selectedDate.getFullYear(), month, day);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mini-day";
      if (sameDate(date, new Date())) button.classList.add("is-today");
      if (sameDate(date, selectedDate)) button.classList.add("is-selected");
      if (holidaysOnDate(toIsoDate(date)).length) button.classList.add("holiday-day");
      else if (isWeekend(date)) button.classList.add("weekend-day");
      button.setAttribute("aria-label", `Open ${formatLongDate(date)} in Day view`);
      const number = document.createElement("span");
      number.textContent = String(day);
      const counts = countsForDate(date);
      const dots = document.createElement("span");
      dots.className = "mini-dots";
      if (counts.tasks) {
        const dot = document.createElement("i");
        dot.className = "task-dot";
        dots.append(dot);
      }
      if (counts.events) {
        const dot = document.createElement("i");
        dot.className = "event-dot";
        dots.append(dot);
      }
      button.append(number, dots);
      button.addEventListener("click", () => openDate(date));
      days.append(button);
    }
    monthCard.append(heading, weekdays, days);
    grid.append(monthCard);
  }
  stage.replaceChildren(grid);
}

function appendAgendaItems(list, tasks, dayEvents) {
  tasks.forEach(({ task, index }) => {
    const row = document.createElement("li");
    row.append(createCalendarItem("task", task, index));
    list.append(row);
  });
  dayEvents.forEach((event) => {
    const row = document.createElement("li");
    row.append(createCalendarItem("event", event));
    list.append(row);
  });
}

function createTaskStack(tasks, isoDate, context = "day") {
  const stack = document.createElement("div");
  stack.className = `task-card-stack ${context}-task-stack`;
  let expanded = expandedTaskDates.has(isoDate);
  stack.classList.toggle("expanded", expanded);

  const layers = document.createElement("span");
  layers.className = "task-stack-layers";
  layers.setAttribute("aria-hidden", "true");
  const layerCount = Math.min(Math.max(tasks.length - 1, 0), 3);
  const layerRise = context === "week" ? 4 : 6;
  const layerInset = context === "week" ? 3 : 5;
  for (let layerIndex = layerCount; layerIndex >= 1; layerIndex -= 1) {
    const layer = document.createElement("i");
    layer.className = "task-stack-layer";
    layer.style.setProperty("--stack-y", `${-layerIndex * layerRise}px`);
    layer.style.setProperty("--stack-inset", `${layerIndex * layerInset}px`);
    layers.append(layer);
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "task-stack-toggle";
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute("aria-controls", `task-stack-items-${context}-${isoDate}`);
  toggle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} for ${isoDate}`);

  const icon = document.createElement("span");
  icon.className = "task-stack-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M8 9h8M8 12h8M8 15h6"></path></svg>';
  const label = document.createElement("span");
  label.className = "task-stack-label";
  label.textContent = `${tasks.length} ${tasks.length === 1 ? "Task" : "Tasks"}`;
  const hint = document.createElement("span");
  hint.className = "task-stack-hint";
  hint.textContent = expanded ? "Collapse" : "Show all";
  const chevron = document.createElement("span");
  chevron.className = "task-stack-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.classList.toggle("up", expanded);
  toggle.append(icon, label, hint, chevron);

  const itemsClip = document.createElement("div");
  itemsClip.id = `task-stack-items-${context}-${isoDate}`;
  itemsClip.className = "task-stack-items-clip";
  itemsClip.inert = !expanded;
  const itemsClipInner = document.createElement("div");
  itemsClipInner.className = "task-stack-items-clip-inner";
  const items = document.createElement("div");
  items.className = "task-stack-items";
  tasks.forEach(({ task, index }, taskPosition) => {
    const item = createCalendarItem("task", task, index);
    item.style.setProperty("--task-stack-delay", `${Math.min(taskPosition * 18, 72)}ms`);
    items.append(item);
  });
  itemsClipInner.append(items);
  itemsClip.append(itemsClipInner);

  const updateExpandedState = (nextExpanded) => {
    expanded = nextExpanded;
    if (expanded) expandedTaskDates.add(isoDate);
    else expandedTaskDates.delete(isoDate);
    stack.classList.toggle("expanded", expanded);
    itemsClip.inert = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} for ${isoDate}`);
    hint.textContent = expanded ? "Collapse" : "Show all";
    chevron.classList.toggle("up", expanded);
  };

  toggle.addEventListener("click", () => {
    updateExpandedState(!expanded);
  });
  stack.append(layers, toggle, itemsClip);
  return stack;
}

function createHolidayBanner(holidayEvents) {
  const banner = document.createElement("div");
  banner.className = "holiday-banner";
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "◆";
  const text = document.createElement("span");
  holidayEvents.forEach((event, index) => {
    if (index) text.append(document.createTextNode(" · "));
    const name = document.createElement("span");
    name.textContent = event.title;
    name.setAttribute("role", "button");
    name.setAttribute("aria-label", `Edit holiday: ${event.title}`);
    name.tabIndex = 0;
    name.addEventListener("click", () => openEventDialog(event.id));
    name.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
      keyEvent.preventDefault();
      openEventDialog(event.id);
    });
    text.append(name);
  });
  banner.append(icon, text);
  return banner;
}

function renderDay() {
  periodLabel.textContent = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(selectedDate);
  const isoDate = toIsoDate(selectedDate);
  const tasks = tasksOnDate(isoDate);
  const dayEvents = eventsOnDate(isoDate);
  const holidayEvents = dayEvents.filter((event) => event.holiday);
  const allDayEvents = dayEvents.filter((event) => !event.holiday && event.allDay);
  const timedEvents = sortTimedEvents(dayEvents.filter((event) => !event.holiday && !event.allDay));
  const wrapper = document.createElement("div");
  wrapper.className = "day-view";
  if (holidayEvents.length) wrapper.classList.add("holiday-period");
  else if (isWeekend(selectedDate)) wrapper.classList.add("weekend-day");
  const heading = document.createElement("div");
  heading.className = "day-heading";
  const dateNumber = document.createElement("strong");
  dateNumber.textContent = String(selectedDate.getDate());
  const dayName = document.createElement("span");
  dayName.textContent = formatLongDate(selectedDate);
  heading.append(dateNumber, dayName);
  wrapper.append(heading);
  if (holidayEvents.length) wrapper.append(createHolidayBanner(holidayEvents));

  const createSection = (titleText, sectionTasks, sectionEvents, emptyText) => {
    const section = document.createElement("section");
    section.className = "agenda-section";
    const title = document.createElement("h3");
    title.textContent = titleText;
    section.append(title);
    if (sectionTasks.length) {
      section.append(createTaskStack(sectionTasks, isoDate, "day"));
    } else if (sectionEvents.length) {
      const list = document.createElement("ul");
      list.className = "agenda-list";
      appendAgendaItems(list, sectionTasks, sectionEvents);
      section.append(list);
    } else {
      const empty = document.createElement("p");
      empty.className = "empty-agenda";
      empty.textContent = emptyText;
      section.append(empty);
    }
    return section;
  };
  wrapper.append(
    createSection("Tasks", tasks, [], "No tasks."),
    createSection("Events", [], [...allDayEvents, ...timedEvents], "No events."),
  );
  stage.replaceChildren(wrapper);
}

function renderWeek() {
  const weekStart = startOfMondayWeek(selectedDate);
  const weekEnd = addDays(weekStart, 6);
  const startLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(weekStart);
  const endLabel = new Intl.DateTimeFormat(undefined, {
    month: weekStart.getMonth() === weekEnd.getMonth() ? undefined : "short",
    day: "numeric",
    year: "numeric",
  }).format(weekEnd);
  periodLabel.textContent = `${startLabel} – ${endLabel}`;
  const wrapper = document.createElement("div");
  wrapper.className = "week-view";
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(weekStart, offset);
    const isoDate = toIsoDate(date);
    const tasks = tasksOnDate(isoDate);
    const dayEvents = eventsOnDate(isoDate);
    const holidayEvents = dayEvents.filter((event) => event.holiday);
    const column = document.createElement("section");
    column.className = "week-day";
    if (sameDate(date, selectedDate)) column.classList.add("selected-day");
    if (holidayEvents.length) column.classList.add("holiday-day");
    else if (isWeekend(date)) column.classList.add("weekend-day");
    const header = document.createElement("button");
    header.type = "button";
    header.className = "week-day-header";
    const name = document.createElement("span");
    name.textContent = weekdayNames[date.getDay()];
    const number = document.createElement("strong");
    number.textContent = `${monthNames[date.getMonth()].slice(0, 3)} ${date.getDate()}`;
    header.append(name, number);
    header.addEventListener("click", () => openDate(date));
    column.append(header);
    if (holidayEvents.length) column.append(createHolidayBanner(holidayEvents));

    const appendGroup = (labelText, groupTasks, groupEvents) => {
      if (!groupTasks.length && !groupEvents.length) return;
      const label = document.createElement("p");
      label.className = "week-group-label";
      label.textContent = labelText;
      column.append(label);
      if (groupTasks.length) column.append(createTaskStack(groupTasks, isoDate, "week"));
      groupEvents.forEach((event) => column.append(createCalendarItem("event", event)));
    };
    appendGroup("Tasks", tasks, []);
    appendGroup("Events", [], [
      ...dayEvents.filter((event) => !event.holiday && event.allDay),
      ...sortTimedEvents(dayEvents.filter((event) => !event.holiday && !event.allDay)),
    ]);
    if (!tasks.length && !dayEvents.length) {
      const empty = document.createElement("p");
      empty.className = "empty-agenda";
      empty.textContent = "No plans";
      column.append(empty);
    }
    wrapper.append(column);
  }
  stage.replaceChildren(wrapper);
}

function renderCalendar() {
  viewButtons.forEach((button) => {
    const active = button.dataset.view === calendarView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (calendarView === "day") renderDay();
  else if (calendarView === "week") renderWeek();
  else if (calendarView === "year") renderYear();
  else renderMonth();
  updateNavigationButtons();
  scheduleDateRefresh();
}

function scheduleDateRefresh() {
  clearTimeout(dateRefreshTimer);
  const now = new Date();
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  dateRefreshTimer = window.setTimeout(() => {
    taskState = loadTaskState();
    renderCalendar();
  }, nextDay.getTime() - now.getTime());
}

function openDate(date) {
  selectedDate = startOfDay(date);
  calendarView = "day";
  localStorage.setItem(CALENDAR_VIEW_KEY, calendarView);
  renderCalendar();
}

function movedPeriodDate(direction) {
  if (calendarView === "day") return addDays(selectedDate, direction);
  if (calendarView === "week") return addDays(selectedDate, direction * 7);
  if (calendarView === "month") return addMonths(selectedDate, direction);
  return addYears(selectedDate, direction);
}

function dateIsInCalendarRange(date) {
  return date.getFullYear() >= MIN_CALENDAR_YEAR && date.getFullYear() <= MAX_CALENDAR_YEAR;
}

function updateNavigationButtons() {
  const year = selectedDate.getFullYear();
  previousYearButton.disabled = year <= MIN_CALENDAR_YEAR;
  nextYearButton.disabled = year >= MAX_CALENDAR_YEAR;
  previousButton.disabled = !dateIsInCalendarRange(movedPeriodDate(-1));
  nextButton.disabled = !dateIsInCalendarRange(movedPeriodDate(1));
}

function movePeriod(direction) {
  const nextDate = movedPeriodDate(direction);
  if (!dateIsInCalendarRange(nextDate)) return;
  selectedDate = nextDate;
  renderCalendar();
}

function switchYear(direction) {
  const targetYear = selectedDate.getFullYear() + direction;
  if (targetYear < MIN_CALENDAR_YEAR || targetYear > MAX_CALENDAR_YEAR) return;
  selectedDate = addYears(selectedDate, direction);
  renderCalendar();
}

function showNotice(message) {
  clearTimeout(noticeTimer);
  calendarNotice.textContent = message;
  calendarNotice.hidden = false;
  noticeTimer = window.setTimeout(() => { calendarNotice.hidden = true; }, 2600);
}

function setEventTab(mode) {
  const natural = mode === "natural";
  if (!natural) eventVoiceInput?.cancel();
  const updateMode = () => {
    naturalTab.classList.toggle("active", natural);
    manualTab.classList.toggle("active", !natural);
    naturalTab.setAttribute("aria-selected", String(natural));
    manualTab.setAttribute("aria-selected", String(!natural));
    naturalPanel.hidden = !natural;
    if (natural) {
      eventPreview.hidden = eventDrafts.length === 0;
      if (eventDrafts.length) showBatchEventPreview();
    } else {
      if (eventDrafts.length) eventDrafts = readEventDraftCards();
      eventPreview.hidden = false;
      previewLabel.textContent = "MANUAL EVENT DETAILS";
      eventPreviewSummary.hidden = true;
      eventDraftList.hidden = true;
      addEventDraftButton.hidden = true;
      singleEventFields.hidden = false;
      setSingleEventFieldsDisabled(false);
      saveEventButton.disabled = false;
      saveEventButton.textContent = "Add to review";
      needsDateConfirmation = false;
      eventClarification.hidden = true;
      if (!eventStartDate.value) eventStartDate.value = toIsoDate(selectedDate);
      if (!eventEndDate.value) eventEndDate.value = eventStartDate.value;
    }
  };
  const transition = eventDialog.open && window.runTodoViewTransition
    ? window.runTodoViewTransition("event-panel", updateMode)
    : (updateMode(), null);
  if (!natural && eventDialog.open) {
    const ready = transition?.ready || Promise.resolve();
    ready.finally(() => requestAnimationFrame(() => eventTitle.focus()));
  }
}

function closeDialogAnimated(dialog) {
  if (!dialog?.open || dialog.classList.contains("is-closing")) return;
  clearTimeout(dialogOpenTimers.get(dialog));
  dialog.classList.remove("is-opening");
  if (reducedMotion.matches) {
    dialog.close();
    return;
  }
  dialog.classList.add("is-closing");
  window.setTimeout(() => {
    dialog.close();
    dialog.classList.remove("is-closing");
  }, 170);
}

function prepareDialogOpening(dialog) {
  clearTimeout(dialogOpenTimers.get(dialog));
  dialog.classList.remove("is-closing", "is-opening");
  if (reducedMotion.matches) return;
  dialog.classList.add("is-opening");
  dialogOpenTimers.set(dialog, window.setTimeout(() => {
    dialog.classList.remove("is-opening");
    dialogOpenTimers.delete(dialog);
  }, 360));
}

function updateTimeFields() {
  const holiday = eventHoliday.checked;
  eventStartTime.disabled = holiday;
  eventEndTime.disabled = holiday;
  if (holiday) {
    eventStartTime.value = "";
    eventEndTime.value = "";
  }
}

function setSingleEventFieldsDisabled(disabled) {
  [eventTitle, eventStartDate, eventEndDate, eventHoliday, eventStartTime, eventEndTime]
    .forEach((field) => { field.disabled = disabled; });
  if (!disabled) updateTimeFields();
}

function fillEventFields(event) {
  eventTitle.value = event.title || "";
  eventStartDate.value = event.startDate || "";
  eventEndDate.value = event.endDate || event.startDate || "";
  eventHoliday.checked = Boolean(event.holiday);
  eventStartTime.value = event.startTime || "";
  eventEndTime.value = event.endTime || "";
  updateTimeFields();
}

function resetEventEditor() {
  eventVoiceInput?.cancel();
  editingEventId = null;
  eventDrafts = [];
  needsDateConfirmation = false;
  eventEditor.reset();
  eventDescription.value = "";
  eventAiStatus.textContent = "Your text stays here if interpretation fails.";
  eventAiStatus.className = "dialog-status";
  eventEntryTabs.hidden = false;
  naturalPanel.hidden = false;
  eventPreview.hidden = true;
  eventClarification.hidden = true;
  eventPreviewSummary.hidden = true;
  eventDraftList.hidden = true;
  eventDraftList.replaceChildren();
  addEventDraftButton.hidden = true;
  singleEventFields.hidden = false;
  setSingleEventFieldsDisabled(false);
  dateConfirmed.checked = false;
  deleteEventButton.hidden = true;
  saveEventButton.textContent = "Save event";
  saveEventButton.disabled = false;
  eventSaveStatus.hidden = true;
  eventSaveStatus.textContent = "";
  fillEventFields({ title: "", startDate: toIsoDate(selectedDate), endDate: toIsoDate(selectedDate), allDay: true, holiday: false });
  setEventTab("natural");
}

function setEventSaveStatus(message = "") {
  eventSaveStatus.textContent = message;
  eventSaveStatus.hidden = !message;
}

function blankEventDraft() {
  return {
    title: "", startDate: "", endDate: "", holiday: false,
    startTime: "", endTime: "", dateMissing: true, dateAmbiguous: false,
    clarificationQuestion: "Enter a date for this event.", confirmed: false,
  };
}

function makeDraftField(labelText, type, value, className = "") {
  const label = document.createElement("label");
  if (className) label.className = className;
  label.append(document.createTextNode(labelText));
  const input = document.createElement("input");
  input.type = type;
  input.value = value || "";
  label.append(input);
  return { label, input };
}

function readEventDraftCards() {
  return [...eventDraftList.querySelectorAll(".event-draft-card")].map((card) => ({
    title: card.querySelector('[data-field="title"]').value.trim(),
    startDate: card.querySelector('[data-field="startDate"]').value,
    endDate: card.querySelector('[data-field="endDate"]').value,
    holiday: card.querySelector('[data-field="holiday"]').checked,
    startTime: card.querySelector('[data-field="startTime"]').value,
    endTime: card.querySelector('[data-field="endTime"]').value,
    dateMissing: card.dataset.dateMissing === "true",
    dateAmbiguous: card.dataset.dateAmbiguous === "true",
    clarificationQuestion: card.dataset.question || "",
    confirmed: card.dataset.confirmed === "true",
  }));
}

function showBatchEventPreview() {
  if (!eventDrafts.length) {
    eventPreview.hidden = true;
    saveEventButton.disabled = false;
    saveEventButton.textContent = "Save event";
    return;
  }
  previewLabel.textContent = "REVIEW BEFORE SAVING";
  eventPreview.hidden = false;
  eventPreviewSummary.hidden = false;
  eventDraftList.hidden = false;
  addEventDraftButton.hidden = false;
  singleEventFields.hidden = true;
  setSingleEventFieldsDisabled(true);
  eventClarification.hidden = true;
  deleteEventButton.hidden = true;
  const count = eventDrafts.length;
  eventPreviewSummary.textContent = `Edit, remove, or add events below. ${count} ${count === 1 ? "event" : "events"} ready to review.`;
  saveEventButton.textContent = `Save ${count} ${count === 1 ? "event" : "events"}`;
  saveEventButton.disabled = false;
}

function renderEventDrafts() {
  eventDraftList.replaceChildren();
  eventDrafts.forEach((draft, index) => {
    const card = document.createElement("article");
    card.className = "event-draft-card";
    card.dataset.dateMissing = String(Boolean(draft.dateMissing));
    card.dataset.dateAmbiguous = String(Boolean(draft.dateAmbiguous));
    card.dataset.confirmed = String(Boolean(draft.confirmed));
    card.dataset.question = draft.clarificationQuestion || "";

    const heading = document.createElement("div");
    heading.className = "event-draft-heading";
    const title = document.createElement("strong");
    title.textContent = `Event ${index + 1}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "event-draft-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      eventDrafts = readEventDraftCards();
      eventDrafts.splice(index, 1);
      renderEventDrafts();
    });
    heading.append(title, remove);

    const fields = document.createElement("div");
    fields.className = "event-fields event-draft-fields";
    const titleField = makeDraftField("Event title", "text", draft.title, "wide-field");
    titleField.input.maxLength = 200;
    titleField.input.dataset.field = "title";
    const startDateField = makeDraftField("Start date", "date", draft.startDate);
    startDateField.input.dataset.field = "startDate";
    const endDateField = makeDraftField("End date", "date", draft.endDate || draft.startDate);
    endDateField.input.dataset.field = "endDate";
    startDateField.input.addEventListener("change", () => {
      if (!endDateField.input.value || endDateField.input.value < startDateField.input.value) endDateField.input.value = startDateField.input.value;
    });
    const holidayLabel = document.createElement("label");
    holidayLabel.className = "all-day-field holiday-field";
    const holidayInput = document.createElement("input");
    holidayInput.type = "checkbox";
    holidayInput.checked = Boolean(draft.holiday);
    holidayInput.dataset.field = "holiday";
    holidayLabel.append(holidayInput, document.createTextNode(" Holiday "));
    const holidayHint = document.createElement("span");
    holidayHint.textContent = "Highlights the full date range";
    holidayLabel.append(holidayHint);
    const startTimeField = makeDraftField("Start time (optional)", "time", draft.startTime, "time-field");
    startTimeField.input.dataset.field = "startTime";
    const endTimeField = makeDraftField("End time (optional)", "time", draft.endTime, "time-field");
    endTimeField.input.dataset.field = "endTime";
    const updateHoliday = () => {
      startTimeField.input.disabled = holidayInput.checked;
      endTimeField.input.disabled = holidayInput.checked;
      if (holidayInput.checked) {
        startTimeField.input.value = "";
        endTimeField.input.value = "";
      }
    };
    holidayInput.addEventListener("change", updateHoliday);
    updateHoliday();
    fields.append(titleField.label, startDateField.label, endDateField.label, holidayLabel, startTimeField.label, endTimeField.label);

    card.append(heading);
    if (draft.dateMissing || draft.dateAmbiguous) {
      const clarification = document.createElement("div");
      clarification.className = "event-clarification draft-clarification";
      const question = document.createElement("p");
      question.textContent = draft.clarificationQuestion || "Please check this event date before saving.";
      const confirmDate = document.createElement("button");
      confirmDate.type = "button";
      confirmDate.className = "confirm-event-date";
      confirmDate.textContent = "Confirm date";
      confirmDate.addEventListener("click", () => {
        if (!parseIsoDate(startDateField.input.value) || !parseIsoDate(endDateField.input.value)) {
          setEventSaveStatus("Enter a valid start and end date before confirming.");
          (parseIsoDate(startDateField.input.value) ? endDateField.input : startDateField.input).focus();
          return;
        }
        if (endDateField.input.value < startDateField.input.value) {
          setEventSaveStatus("The end date cannot be before the start date.");
          endDateField.input.focus();
          return;
        }
        card.dataset.dateMissing = "false";
        card.dataset.dateAmbiguous = "false";
        card.dataset.confirmed = "true";
        card.dataset.question = "";
        clarification.remove();
        setEventSaveStatus();
        setEventAiStatus("Date confirmed. This event is ready to save.", "success");
      });
      clarification.append(question, confirmDate);
      card.append(clarification);
    }
    card.append(fields);
    card.addEventListener("input", () => {
      card.classList.remove("has-save-error");
      setEventSaveStatus();
    });
    eventDraftList.append(card);
  });
  showBatchEventPreview();
}

function setEventAiStatus(message, type = "idle") {
  eventAiStatus.textContent = message;
  eventAiStatus.className = `dialog-status${type === "idle" ? "" : ` ${type}`}`;
}

function openEventDialog(eventId = null) {
  resetEventEditor();
  if (eventId) {
    const event = events.find((item) => item.id === eventId);
    if (!event) return;
    editingEventId = eventId;
    eventDialogTitle.textContent = "Edit event";
    eventEntryTabs.hidden = true;
    naturalPanel.hidden = true;
    eventPreview.hidden = false;
    previewLabel.textContent = "EVENT DETAILS";
    deleteEventButton.hidden = false;
    saveEventButton.textContent = "Save changes";
    setSingleEventFieldsDisabled(false);
    fillEventFields(event);
  } else {
    eventDialogTitle.textContent = "Add an event";
  }
  prepareDialogOpening(eventDialog);
  eventDialog.showModal();
  requestAnimationFrame(() => (eventId ? eventTitle : eventDescription).focus());
}

function showEventClarification(message, required = true) {
  needsDateConfirmation = required;
  eventQuestion.textContent = message;
  eventClarification.hidden = false;
  dateConfirmed.checked = false;
}

async function interpretEvent(inputOverride, inputMethod = "typed") {
  if (isInterpretingEvent) return;
  const input = typeof inputOverride === "string" ? inputOverride.trim() : eventDescription.value.trim();
  if (!input) {
    setEventAiStatus("Describe an event before asking AI to interpret it.", "error");
    return;
  }
  isInterpretingEvent = true;
  interpretEventButton.disabled = true;
  interpretEventButton.textContent = "Asking AI…";
  eventVoiceInput?.updateControls();
  setEventAiStatus("DeepSeek is interpreting the event details…", "processing");
  try {
    const response = await fetch("/api/parse-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, inputMethod, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Event interpretation failed.");
    const generated = Array.isArray(result.events) ? result.events : (result.event ? [result.event] : []);
    if (!generated.length) throw new Error("No calendar events were found. Add more detail and try again.");
    if (eventDrafts.length) eventDrafts = readEventDraftCards();
    eventDrafts.push(...generated.map((event) => ({ ...event, confirmed: !event.dateMissing && !event.dateAmbiguous })));
    renderEventDrafts();
    eventDescription.value = "";
    setEventAiStatus(`${generated.length} ${generated.length === 1 ? "event" : "events"} added to the review. You can describe more events now.`, "success");
    requestAnimationFrame(() => eventDescription.focus());
  } catch (error) {
    setEventAiStatus(error.message || "Interpretation failed. Your text is preserved; use manual entry or retry.", "error");
  } finally {
    isInterpretingEvent = false;
    interpretEventButton.disabled = false;
    interpretEventButton.textContent = "Ask AI";
    eventVoiceInput?.updateControls();
  }
}

function validateEventFields() {
  if (!eventTitle.value.trim()) return "Enter an event title.";
  if (!parseIsoDate(eventStartDate.value) || !parseIsoDate(eventEndDate.value)) return "Enter a valid start and end date.";
  if (eventEndDate.value < eventStartDate.value) return "The end date cannot be before the start date.";
  if (needsDateConfirmation && !dateConfirmed.checked) return "Confirm the clarified dates before saving.";
  if (eventEndTime.value && !eventStartTime.value) return "Enter a start time or clear the end time.";
  if (eventStartDate.value === eventEndDate.value
    && eventStartTime.value && eventEndTime.value && eventEndTime.value <= eventStartTime.value) {
    return "The end time must be later than the start time.";
  }
  return "";
}

function saveEventFromEditor() {
  setEventSaveStatus();
  if (!editingEventId && naturalPanel.hidden) {
    const error = validateEventFields();
    if (error) {
      showEventClarification(error, needsDateConfirmation);
      setEventSaveStatus(error);
      return;
    }
    eventDrafts.push({
      title: eventTitle.value.trim(), startDate: eventStartDate.value, endDate: eventEndDate.value,
      holiday: eventHoliday.checked, startTime: eventHoliday.checked ? "" : eventStartTime.value,
      endTime: eventHoliday.checked || !eventStartTime.value ? "" : eventEndTime.value,
      dateMissing: false, dateAmbiguous: false, clarificationQuestion: "", confirmed: true,
    });
    fillEventFields({ title: "", startDate: toIsoDate(selectedDate), endDate: toIsoDate(selectedDate), holiday: false, startTime: "", endTime: "" });
    setEventTab("natural");
    renderEventDrafts();
    setEventAiStatus("Manual event added to the review. You can add more before saving.", "success");
    requestAnimationFrame(() => eventDescription.focus());
    return;
  }
  if (!editingEventId && eventDrafts.length) {
    eventDrafts = readEventDraftCards();
    const prepared = [];
    for (let index = 0; index < eventDrafts.length; index += 1) {
      const draft = eventDrafts[index];
      const prefix = `Event ${index + 1}`;
      let error = "";
      if (!draft.title) error = `${prefix}: enter an event title.`;
      else if (!parseIsoDate(draft.startDate) || !parseIsoDate(draft.endDate)) error = `${prefix}: enter a valid start and end date.`;
      else if (draft.endDate < draft.startDate) error = `${prefix}: the end date cannot be before the start date.`;
      else if ((draft.dateMissing || draft.dateAmbiguous) && !draft.confirmed) error = `${prefix}: confirm the clarified dates before saving.`;
      else if (draft.endTime && !draft.startTime) error = `${prefix}: enter a start time or clear the end time.`;
      else if (draft.startDate === draft.endDate && draft.startTime && draft.endTime && draft.endTime <= draft.startTime) error = `${prefix}: the end time must be later than the start time.`;
      if (error) {
        setEventAiStatus(error, "error");
        setEventSaveStatus(error);
        eventDraftList.children[index]?.classList.add("has-save-error");
        eventDraftList.children[index]?.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "center" });
        return;
      }
      prepared.push({
        id: crypto.randomUUID(), title: draft.title, startDate: draft.startDate, endDate: draft.endDate,
        holiday: draft.holiday, allDay: draft.holiday || !draft.startTime,
        startTime: draft.holiday ? "" : draft.startTime,
        endTime: draft.holiday || !draft.startTime ? "" : draft.endTime,
      });
    }
    events.push(...prepared);
    saveEvents();
    eventDialog.close();
    renderCalendar();
    showNotice(`${prepared.length} ${prepared.length === 1 ? "event" : "events"} saved.`);
    return;
  }
  const error = validateEventFields();
  if (error) {
    showEventClarification(error, needsDateConfirmation);
    setEventSaveStatus(error);
    return;
  }
  const event = {
    id: editingEventId || crypto.randomUUID(),
    title: eventTitle.value.trim(),
    startDate: eventStartDate.value,
    endDate: eventEndDate.value,
    allDay: eventHoliday.checked || !eventStartTime.value,
    holiday: eventHoliday.checked,
    startTime: eventHoliday.checked ? "" : eventStartTime.value,
    endTime: eventHoliday.checked || !eventStartTime.value ? "" : eventEndTime.value,
  };
  if (editingEventId) {
    const index = events.findIndex((item) => item.id === editingEventId);
    if (index !== -1) events[index] = event;
  } else {
    events.push(event);
  }
  saveEvents();
  eventDialog.close();
  renderCalendar();
  showNotice(editingEventId ? "Event updated." : "Event saved.");
}

function deleteCurrentEvent() {
  if (!editingEventId) return;
  const event = events.find((item) => item.id === editingEventId);
  if (!event || !window.confirm(`Delete “${event.title}”?`)) return;
  events = events.filter((item) => item.id !== editingEventId);
  saveEvents();
  eventDialog.close();
  renderCalendar();
  showNotice("Event deleted.");
}

function openTaskDialog(index) {
  const task = taskState.tasks[index];
  if (!task) return;
  editingTaskIndex = index;
  taskTitle.value = task.task;
  taskSubject.value = task.subject;
  taskLabel.value = task.label;
  taskDueDate.value = task.date ? toIsoDate(task.date) : "";
  taskCompleted.checked = task.completed;
  prepareDialogOpening(taskDialog);
  taskDialog.showModal();
  requestAnimationFrame(() => taskTitle.focus());
}

function saveTaskFromEditor() {
  if (editingTaskIndex === null || !taskTitle.value.trim() || !taskSubject.value.trim()) return;
  const task = taskState.tasks[editingTaskIndex];
  task.task = taskTitle.value.trim();
  task.subject = taskSubject.value.trim();
  task.label = taskLabel.value.trim().replace(/\s+/g, " ").slice(0, 40);
  task.date = taskDueDate.value ? dateObjectFromIso(taskDueDate.value) : null;
  if (task.completed !== taskCompleted.checked) {
    Object.assign(task, TodoTaskRules.withCompletion(task, taskCompleted.checked));
  }
  saveTaskState();
  taskDialog.close();
  renderCalendar();
  showNotice("Task updated in the calendar and To-Do List.");
}

function deleteCurrentTask() {
  if (editingTaskIndex === null || !taskState.tasks[editingTaskIndex]) return;
  const task = taskState.tasks[editingTaskIndex];
  if (!window.confirm(`Delete “${task.task}” from the To-Do List and calendar?`)) return;
  taskState.tasks.splice(editingTaskIndex, 1);
  editingTaskIndex = null;
  saveTaskState();
  taskDialog.close();
  renderCalendar();
  showNotice("Task deleted from the To-Do List and calendar.");
}

previousButton.addEventListener("click", () => movePeriod(-1));
nextButton.addEventListener("click", () => movePeriod(1));
previousYearButton.addEventListener("click", () => switchYear(-1));
nextYearButton.addEventListener("click", () => switchYear(1));
todayButton.addEventListener("click", () => {
  selectedDate = startOfDay(new Date());
  renderCalendar();
});
viewButtons.forEach((button) => button.addEventListener("click", () => {
  calendarView = button.dataset.view;
  localStorage.setItem(CALENDAR_VIEW_KEY, calendarView);
  renderCalendar();
}));

addEventButton.addEventListener("click", () => openEventDialog());
addEventDraftButton.addEventListener("click", () => {
  if (eventDrafts.length) eventDrafts = readEventDraftCards();
  eventDrafts.push(blankEventDraft());
  renderEventDrafts();
  eventDraftList.lastElementChild?.querySelector('[data-field="title"]')?.focus();
});
eventVoiceInput = new DoubaoVoiceInput({
  recordButton: eventRecordButton,
  cancelButton: cancelEventRecordingButton,
  timer: eventRecordingTimer,
  waveform: eventVoiceWaveform,
  isBusy: () => isInterpretingEvent,
  onStatus: setEventAiStatus,
  onTranscript: async (transcript) => {
    setEventAiStatus("Speech recognized. DeepSeek is generating the event review…", "processing");
    await interpretEvent(transcript, "voice");
  },
});
if (!navigator.mediaDevices?.getUserMedia) {
  setEventAiStatus("Voice recording is not supported in this browser. Continue typing instead.", "error");
}
naturalTab.addEventListener("click", () => setEventTab("natural"));
manualTab.addEventListener("click", () => setEventTab("manual"));
interpretEventButton.addEventListener("click", interpretEvent);
eventDescription.addEventListener("compositionstart", () => { isEventDescriptionComposing = true; });
eventDescription.addEventListener("compositionend", () => { isEventDescriptionComposing = false; });
eventDescription.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  if (event.isComposing || isEventDescriptionComposing || event.keyCode === 229) return;
  event.preventDefault();
  interpretEvent();
});
eventHoliday.addEventListener("change", updateTimeFields);
eventStartDate.addEventListener("change", () => {
  if (!eventEndDate.value || eventEndDate.value < eventStartDate.value) eventEndDate.value = eventStartDate.value;
});
eventEditor.addEventListener("submit", (event) => {
  event.preventDefault();
  saveEventFromEditor();
});
saveEventButton.addEventListener("click", saveEventFromEditor);
deleteEventButton.addEventListener("click", deleteCurrentEvent);
deleteTaskButton.addEventListener("click", deleteCurrentTask);
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => closeDialogAnimated(button.closest("dialog")));
});
taskEditor.addEventListener("submit", (event) => {
  event.preventDefault();
  saveTaskFromEditor();
});
eventDialog.addEventListener("close", () => eventVoiceInput.cancel());
[eventDialog, taskDialog].forEach((dialog) => {
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialogAnimated(dialog);
  });
  dialog.addEventListener("close", () => dialog.classList.remove("is-closing"));
  dialog.addEventListener("close", () => {
    clearTimeout(dialogOpenTimers.get(dialog));
    dialogOpenTimers.delete(dialog);
    dialog.classList.remove("is-opening");
  });
});

appearanceSelect.addEventListener("change", () => {
  appearanceMode = appearanceSelect.value;
  localStorage.setItem(APPEARANCE_KEY, appearanceMode);
  applyAppearance();
  announceAppearanceChange();
});
const handleSystemAppearanceChange = () => {
  if (appearanceMode === "system") applyAppearance();
};
if (systemDarkMode.addEventListener) systemDarkMode.addEventListener("change", handleSystemAppearanceChange);
else systemDarkMode.addListener(handleSystemAppearanceChange);

window.addEventListener("storage", (event) => {
  if (event.key === TASK_STORAGE_KEY) taskState = loadTaskState();
  if (event.key === EVENT_STORAGE_KEY) events = loadEvents();
  if (event.key === TASK_STORAGE_KEY || event.key === EVENT_STORAGE_KEY) renderCalendar();
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  if (event.data?.type === "todo-appearance-sync") {
    const mode = event.data.mode;
    if (!["light", "dark", "system"].includes(mode)) return;
    appearanceMode = mode;
    try { localStorage.setItem(APPEARANCE_KEY, mode); } catch { /* Apply without persistence. */ }
    applyAppearance();
    return;
  }
  if (event.data?.type !== "todo-view-activated") return;
  taskState = loadTaskState();
  events = loadEvents();
  renderCalendar();
});
window.addEventListener("pageshow", () => {
  taskState = loadTaskState();
  events = loadEvents();
  renderCalendar();
});
window.addEventListener("pagehide", () => eventVoiceInput.cancel());

applyAppearance();
renderCalendar();
