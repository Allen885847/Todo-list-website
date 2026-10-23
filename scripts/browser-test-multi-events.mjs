import WebSocket from "ws";

const browserEndpoint = process.argv[2] || "http://127.0.0.1:9233";
const appUrl = process.argv[3] || "http://127.0.0.1:4196/calendar.html?embedded=1";
const target = await fetch(`${browserEndpoint}/json/new?${encodeURIComponent(appUrl)}`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const waiting = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  if (!message.id || !waiting.has(message.id)) return;
  const { resolve, reject } = waiting.get(message.id);
  waiting.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  waiting.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
await command("Runtime.enable");
await command("Page.enable");
await command("Page.navigate", { url: appUrl });
await new Promise((resolve) => setTimeout(resolve, 6_500));
const pageState = await command("Runtime.evaluate", {
  expression: `({ href: location.href, title: document.title, addEvent: Boolean(document.querySelector("#add-event")), body: document.body?.innerText?.slice(0, 160) })`,
  returnByValue: true,
});
if (!pageState.result?.value?.addEvent) throw new Error(`Calendar page did not initialize: ${JSON.stringify(pageState.result?.value)}`);

const expression = `(async () => {
  const waitFor = async (predicate, message) => {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(typeof message === "function" ? message() : message);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  localStorage.removeItem("todo-calendar-events");
  document.documentElement.dataset.theme = "dark";
  document.querySelector('[data-view="day"]').click();
  const periodBeforeSaving = document.querySelector("#period-label").textContent;
  document.querySelector("#add-event").click();
  await waitFor(() => document.querySelector("#event-dialog").open, "Event dialog did not open");
  const backdropFilters = [getComputedStyle(document.querySelector("#event-dialog"), "::backdrop").backdropFilter];
  document.querySelector("#manual-tab").click();
  backdropFilters.push(getComputedStyle(document.querySelector("#event-dialog"), "::backdrop").backdropFilter);
  await new Promise((resolve) => setTimeout(resolve, 320));
  const timeInputStyle = getComputedStyle(document.querySelector("#event-start-time"));
  const timeTextIsWhite = timeInputStyle.color === "rgb(255, 255, 255)"
    && timeInputStyle.webkitTextFillColor === "rgb(255, 255, 255)";
  document.querySelector("#natural-tab").click();
  backdropFilters.push(getComputedStyle(document.querySelector("#event-dialog"), "::backdrop").backdropFilter);
  await new Promise((resolve) => setTimeout(resolve, 320));
  let responseNumber = 0;
  window.fetch = async (url) => {
    if (url !== "/api/parse-event") throw new Error("Unexpected request: " + url);
    responseNumber += 1;
    const payload = responseNumber === 1 ? { events: [
      { title: "Study group", startDate: "2026-10-24", endDate: "2026-10-24", holiday: false, startTime: "15:00", endTime: "16:00", dateMissing: false, dateAmbiguous: false, clarificationQuestion: "" },
      { title: "Birthday dinner", startDate: "2026-10-25", endDate: "2026-10-25", holiday: false, startTime: "19:00", endTime: "", dateMissing: false, dateAmbiguous: false, clarificationQuestion: "" }
    ] } : { events: [
      { title: "School holiday", startDate: "2026-12-20", endDate: "2027-01-05", holiday: true, startTime: "", endTime: "", dateMissing: false, dateAmbiguous: false, clarificationQuestion: "" }
    ] };
    return { ok: true, json: async () => payload };
  };
  document.querySelector("#event-description").value = "Study group tomorrow at 3, and birthday dinner Sunday at 7";
  document.querySelector("#interpret-event").click();
  await waitFor(() => document.querySelectorAll(".event-draft-card").length === 2, "First event batch did not render");
  const firstCount = document.querySelectorAll(".event-draft-card").length;
  document.querySelector("#event-description").value = "Winter holiday from December 20 to January 5";
  document.querySelector("#interpret-event").click();
  await waitFor(() => document.querySelectorAll(".event-draft-card").length === 3, "Additional event did not append");
  const appendedCount = document.querySelectorAll(".event-draft-card").length;
  document.querySelectorAll(".event-draft-remove")[1].click();
  const removedCount = document.querySelectorAll(".event-draft-card").length;
  document.querySelector("#add-event-draft").click();
  const cards = document.querySelectorAll(".event-draft-card");
  const blank = cards[cards.length - 1];
  blank.querySelector('[data-field="title"]').value = "Dentist";
  blank.querySelector('[data-field="startDate"]').value = "2026-10-26";
  blank.querySelector('[data-field="endDate"]').value = "2026-10-26";
  blank.querySelector(".confirm-event-date").click();
  cards[0].querySelector('[data-field="title"]').value = "Physics study group";
  document.querySelector("#save-event").click();
  await waitFor(
    () => !document.querySelector("#event-dialog").open,
    () => "Batch did not save: " + (document.querySelector("#event-save-status").textContent || document.querySelector("#event-ai-status").textContent),
  );
  const periodAfterSaving = document.querySelector("#period-label").textContent;
  const saved = JSON.parse(localStorage.getItem("todo-calendar-events") || "[]");
  window.fetch = async () => ({ ok: true, json: async () => ({ events: [
    { title: "Ambiguous meeting", startDate: "2026-10-27", endDate: "2026-10-27", holiday: false, startTime: "", endTime: "", dateMissing: false, dateAmbiguous: true, clarificationQuestion: "Did you mean October 27?" }
  ] }) });
  document.querySelector("#add-event").click();
  await waitFor(() => document.querySelector("#event-dialog").open, "Confirmation dialog did not open");
  document.querySelector("#event-description").value = "Meeting on 10/27";
  document.querySelector("#interpret-event").click();
  await waitFor(() => Boolean(document.querySelector(".confirm-event-date")), "Date confirmation did not render");
  document.querySelector(".confirm-event-date").click();
  const confirmationCleared = !document.querySelector(".draft-clarification");
  document.querySelector("#save-event").click();
  await waitFor(() => !document.querySelector("#event-dialog").open, "Confirmed event did not save");
  const savedAfterConfirmation = JSON.parse(localStorage.getItem("todo-calendar-events") || "[]");
  return {
    firstCount, appendedCount, removedCount,
    backdropStayedBlurred: backdropFilters.every((value) => value && value !== "none" && value.includes("blur")),
    timeTextIsWhite,
    calendarDatePreserved: periodAfterSaving === periodBeforeSaving,
    savedCount: saved.length,
    titles: saved.map((event) => event.title),
    dialogClosed: !document.querySelector("#event-dialog").open,
    holidayPreserved: saved.some((event) => event.holiday && event.startDate === "2026-12-20" && event.endDate === "2027-01-05"),
    timesPreserved: saved.some((event) => event.startTime === "15:00" && event.endTime === "16:00"),
    confirmationCleared,
    confirmedEventSaved: savedAfterConfirmation.length === 4 && savedAfterConfirmation.some((event) => event.title === "Ambiguous meeting")
  };
})()`;
const evaluation = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
const result = evaluation.result?.value;
socket.close();
if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text);
if (!result || result.firstCount !== 2 || result.appendedCount !== 3 || result.removedCount !== 2
  || !result.backdropStayedBlurred
  || !result.timeTextIsWhite
  || !result.calendarDatePreserved
  || result.savedCount !== 3 || !result.dialogClosed || !result.holidayPreserved || !result.timesPreserved
  || !result.confirmationCleared || !result.confirmedEventSaved
  || result.titles[0] !== "Physics study group" || !result.titles.includes("Dentist")) {
  throw new Error(`Multi-event browser test failed: ${JSON.stringify(result)}`);
}
console.log(`Multi-event browser workflow passed: ${JSON.stringify(result)}`);
