const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 4173;
const API_KEY = process.env.DEEPSEEK_API_KEY;
const DOUBAO_SPEECH_API_KEY = process.env.DOUBAO_SPEECH_API_KEY;
const DOUBAO_SPEECH_RESOURCE_ID = process.env.DOUBAO_SPEECH_RESOURCE_ID || "volc.seedasr.sauc.duration";
const ROOT = __dirname;
const MAX_BODY_SIZE = 30_000;
const MAX_LOCAL_DATA_SIZE = 2 * 1024 * 1024;
const MAX_AUDIO_SIZE = 15 * 1024 * 1024;
const MAX_INPUT_LENGTH = 4_000;
const LOCAL_DATA_DIR = process.env.TODO_DATA_DIR || path.resolve(ROOT, "..", "Todo-list-user-data");
const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, "state.json");
const LOCAL_DATA_BACKUP = path.join(LOCAL_DATA_DIR, "state.previous.json");
const LOCAL_DATA_KEYS = new Set([
  "todo-list-mvp",
  "todo-calendar-events",
  "todo-calendar-events-v2.5",
  "todo-calendar-events-v2.4",
  "todo-appearance",
  "todo-calendar-view",
  "todo-calendar-view-v2.5",
  "todo-data-schema",
  "todo-data-backup-before-v2.5",
]);
const STATIC_FILES = new Map([
  ["/", ["app.html", "text/html; charset=utf-8"]],
  ["/app.html", ["app.html", "text/html; charset=utf-8"]],
  ["/app-shell.css", ["app-shell.css", "text/css; charset=utf-8"]],
  ["/app-shell.js", ["app-shell.js", "text/javascript; charset=utf-8"]],
  ["/login.css", ["login.css", "text/css; charset=utf-8"]],
  ["/login-ui.js", ["login-ui.js", "text/javascript; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/script.js", ["script.js", "text/javascript; charset=utf-8"]],
  ["/calendar.html", ["calendar.html", "text/html; charset=utf-8"]],
  ["/calendar.css", ["calendar.css", "text/css; charset=utf-8"]],
  ["/calendar.js", ["calendar.js", "text/javascript; charset=utf-8"]],
  ["/data.html", ["data.html", "text/html; charset=utf-8"]],
  ["/data.css", ["data.css", "text/css; charset=utf-8"]],
  ["/data.js", ["data.js", "text/javascript; charset=utf-8"]],
  ["/data-migration.js", ["data-migration.js", "text/javascript; charset=utf-8"]],
  ["/persistent-storage.js", ["persistent-storage.js", "text/javascript; charset=utf-8"]],
  ["/task-rules.js", ["task-rules.js", "text/javascript; charset=utf-8"]],
  ["/voice-input.js", ["voice-input.js", "text/javascript; charset=utf-8"]],
  ["/page-transition.js", ["page-transition.js", "text/javascript; charset=utf-8"]],
]);

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function readJson(request, limit = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body) > limit) {
        settled = true;
        reject(new Error("Request is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (settled) return;
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request must contain valid JSON."));
      }
    });
    request.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function readLocalData() {
  try {
    const payload = JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, "utf8"));
    return payload && typeof payload.data === "object" ? payload : { schemaVersion: 1, data: {} };
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Local data could not be read:", error.message);
    return { schemaVersion: 1, data: {} };
  }
}

function writeLocalData(input) {
  const data = {};
  Object.entries(input || {}).forEach(([key, value]) => {
    if (!LOCAL_DATA_KEYS.has(key)) return;
    if (value === null || (typeof value === "string" && value.length <= MAX_LOCAL_DATA_SIZE)) data[key] = value;
  });
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  if (fs.existsSync(LOCAL_DATA_FILE)) fs.copyFileSync(LOCAL_DATA_FILE, LOCAL_DATA_BACKUP);
  const tempFile = path.join(LOCAL_DATA_DIR, `state-${process.pid}.tmp`);
  const payload = { schemaVersion: 1, updatedAt: new Date().toISOString(), data };
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, LOCAL_DATA_FILE);
  return payload;
}

function readBinary(request, limit = MAX_AUDIO_SIZE) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        reject(new Error("Recording is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!settled) resolve(Buffer.concat(chunks));
    });
    request.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function buildDoubaoHeader(messageType, flags, serialization, compression) {
  return Buffer.from([
    0x11,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

function buildDoubaoPacket(messageType, flags, payload, { json = false, compress = true } = {}) {
  const source = json ? Buffer.from(JSON.stringify(payload), "utf8") : Buffer.from(payload);
  const body = compress ? zlib.gzipSync(source) : source;
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length);
  return Buffer.concat([
    buildDoubaoHeader(messageType, flags, json ? 1 : 0, compress ? 1 : 0),
    size,
    body,
  ]);
}

function parseDoubaoMessage(data) {
  const packet = Buffer.from(data);
  if (packet.length < 4) throw new Error("Doubao returned an incomplete response.");
  const headerSize = (packet[0] & 0x0f) * 4;
  const messageType = packet[1] >> 4;
  const flags = packet[1] & 0x0f;
  const serialization = packet[2] >> 4;
  const compression = packet[2] & 0x0f;
  let offset = headerSize;

  if (messageType === 0x0f) {
    if (packet.length < offset + 8) throw new Error("Doubao returned an incomplete error response.");
    const code = packet.readUInt32BE(offset);
    const size = packet.readUInt32BE(offset + 4);
    offset += 8;
    let payload = packet.subarray(offset, offset + size);
    if (compression === 1) payload = zlib.gunzipSync(payload);
    throw new Error(`Doubao transcription failed (${code}): ${payload.toString("utf8")}`);
  }

  if (flags === 1 || flags === 3 || messageType === 0x09 || messageType === 0x0b) {
    if (packet.length < offset + 4) return null;
    offset += 4;
  }
  if (packet.length < offset + 4) return null;
  const size = packet.readUInt32BE(offset);
  offset += 4;
  let payload = packet.subarray(offset, offset + size);
  if (compression === 1 && payload.length) payload = zlib.gunzipSync(payload);
  if (!payload.length) return null;
  return serialization === 1 ? JSON.parse(payload.toString("utf8")) : null;
}

function extractDoubaoTranscript(payload) {
  const result = payload?.result;
  if (typeof result?.text === "string") return result.text.trim();
  if (Array.isArray(result)) {
    return result.map((item) => item?.text || item?.result?.text || "").join("").trim();
  }
  if (typeof payload?.text === "string") return payload.text.trim();
  return "";
}

function transcribeWithDoubao(audio) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const socket = new WebSocket("wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream", {
      headers: {
        "X-Api-Key": DOUBAO_SPEECH_API_KEY,
        "X-Api-Resource-Id": DOUBAO_SPEECH_RESOURCE_ID,
        "X-Api-Request-Id": requestId,
        "X-Api-Connect-Id": requestId,
      },
      handshakeTimeout: 15_000,
    });
    let settled = false;
    let latestTranscript = "";
    const timeout = setTimeout(() => finish(new Error("Doubao took too long to transcribe the recording.")), 90_000);

    function finish(error, transcript = "") {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { socket.close(); } catch { /* The connection may already be closed. */ }
      if (error) reject(error);
      else resolve(transcript);
    }

    socket.on("open", () => {
      const request = {
        user: { uid: "todo-list-website" },
        audio: {
          format: "wav",
          codec: "raw",
          rate: 16000,
          bits: 16,
          channel: 1,
        },
        request: {
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          enable_ddc: true,
          show_utterances: false,
          result_type: "full",
        },
      };
      socket.send(buildDoubaoPacket(0x01, 0x00, request, { json: true, compress: true }));
      socket.send(buildDoubaoPacket(0x02, 0x02, audio, { compress: true }));
    });

    socket.on("message", (data) => {
      try {
        const payload = parseDoubaoMessage(data);
        const transcript = extractDoubaoTranscript(payload);
        if (transcript) latestTranscript = transcript;
        if (payload?.result && latestTranscript) finish(null, latestTranscript);
      } catch (error) {
        finish(error);
      }
    });
    socket.on("unexpected-response", (_request, response) => {
      const chunks = [];
      response.on("data", (chunk) => {
        if (chunks.reduce((size, item) => size + item.length, 0) < 4096) chunks.push(chunk);
      });
      response.on("end", () => {
        const detail = Buffer.concat(chunks).toString("utf8").trim();
        finish(new Error(`Doubao rejected the connection (${response.statusCode})${detail ? `: ${detail}` : ". Check that this API key and Speech Recognition 2.0 are enabled in the same project."}`));
      });
    });
    socket.on("error", (error) => finish(error));
    socket.on("close", () => {
      if (!settled) {
        finish(latestTranscript ? null : new Error("Doubao closed the transcription connection without returning text."), latestTranscript);
      }
    });
  });
}

function resolveTimeZone(value) {
  const timeZone = typeof value === "string" && value.length <= 100 ? value : "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return timeZone;
  } catch {
    return "UTC";
  }
}

function getLocalContext(timeZone) {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type) => dateParts.find((part) => part.type === type)?.value;
  const today = `${value("year")}-${value("month")}-${value("day")}`;
  const localTime = new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);
  return { today, localTime };
}

function isValidDate(date) {
  const { day, month, year } = date || {};
  if (![day, month, year].every(Number.isInteger)) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 2000 &&
    year <= 2200 &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isSingleEmoji(value) {
  if (typeof value !== "string" || value.length > 20 || !/\p{Extended_Pictographic}/u.test(value)) return false;
  const trimmed = value.trim();
  const segments = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(trimmed)];
  return segments.length === 1 && segments[0].segment === trimmed;
}

function normalizeGeneratedTasks(payload) {
  if (!payload || !Array.isArray(payload.tasks) || payload.tasks.length > 30) {
    throw new Error("DeepSeek did not return a valid task list.");
  }

  return payload.tasks.map((item) => {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    const subject = typeof item?.subject === "string" ? item.subject.trim() : "";
    const label = typeof item?.label === "string" ? item.label.trim().replace(/\s+/g, " ") : "";
    const emoji = typeof item?.emoji === "string" ? item.emoji.trim() : "";
    const dateAmbiguous = item?.dateAmbiguous === true;
    const dateQuestion = typeof item?.dateQuestion === "string" ? item.dateQuestion.trim() : "";

    if (!title || title.length > 200 || !subject || subject.length > 80 || label.length > 40 || !isSingleEmoji(emoji) || !isValidDate(item?.date)) {
      throw new Error("DeepSeek returned an invalid task.");
    }
    if (dateAmbiguous && !dateQuestion) {
      throw new Error("DeepSeek omitted an ambiguous-date question.");
    }

    return {
      title,
      subject,
      label,
      emoji,
      date: {
        day: item.date.day,
        month: item.date.month,
        year: item.date.year,
      },
      dateAmbiguous,
      dateQuestion: dateAmbiguous ? dateQuestion.slice(0, 240) : "",
    };
  });
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeGeneratedEvent(payload) {
  const item = payload?.event;
  const title = typeof item?.title === "string" ? item.title.trim() : "";
  const dateMissing = item?.dateMissing === true;
  const dateAmbiguous = item?.dateAmbiguous === true;
  const holiday = item?.holiday === true;
  const clarificationQuestion = typeof item?.clarificationQuestion === "string"
    ? item.clarificationQuestion.trim().slice(0, 240)
    : "";
  const startDate = typeof item?.startDate === "string" ? item.startDate : "";
  const endDate = typeof item?.endDate === "string" ? item.endDate : startDate;
  const startTime = typeof item?.startTime === "string" ? item.startTime : "";
  const endTime = typeof item?.endTime === "string" ? item.endTime : "";
  const validTime = (value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const allDay = holiday || startTime === "";

  if (!title || title.length > 200 || !validTime(startTime) || !validTime(endTime)) {
    throw new Error("DeepSeek returned invalid event details.");
  }
  if (endTime && !startTime) {
    throw new Error("DeepSeek returned an end time without a start time.");
  }
  if (!dateMissing && (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || endDate < startDate)) {
    throw new Error("DeepSeek returned invalid event dates.");
  }
  if ((dateMissing || dateAmbiguous) && !clarificationQuestion) {
    throw new Error("DeepSeek omitted the required date clarification.");
  }

  return {
    title,
    startDate: dateMissing ? "" : startDate,
    endDate: dateMissing ? "" : endDate,
    allDay,
    holiday,
    startTime: allDay ? "" : startTime,
    endTime: allDay ? "" : endTime,
    dateMissing,
    dateAmbiguous,
    clarificationQuestion,
  };
}

async function parseTasks(input, timeZone) {
  const { today, localTime } = getLocalContext(timeZone);
  const apiResponse = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: "deepseek-flash",
      thinking: { type: "disabled" },
      max_tokens: 4_000,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You turn Mandarin Chinese, English, or mixed-language plans into an editable todo-task preview.

Current local context:
- IANA time zone: ${timeZone}
- Today: ${today}
- Current local date and time: ${localTime}

Return JSON only, in exactly this shape:
{"tasks":[{"title":"Clear concise English task title","subject":"History","label":"Extra","emoji":"📚","date":{"day":9,"month":10,"year":2026},"dateAmbiguous":false,"dateQuestion":""}]}

Rules:
1. Create one item for every independently actionable task. Keep supporting details with their relevant task. Do not invent tasks, omit explicit actions, or turn background details into tasks.
2. Every title MUST be a concise noun phrase without a leading action verb. Remove conversational framing such as "I need to," "remember to," or "please." Never begin titles with verbs such as "Complete," "Do," "Finish," "Review," "Create," "Submit," "Send," "Buy," or "Prepare."
3. Apply one stable naming style to every task independently. The same underlying task must receive the same title whether it appears alone or inside a multi-task request; batch size, neighboring tasks, and input order must not affect its title. Required examples: "I need to do a math worksheet" becomes "Math worksheet"; "Review for my history test" becomes "History test review"; and "Complete the physics website homework" becomes "Physics website homework."
4. Preserve the intended action through concise task-name wording when necessary, while keeping the title a noun phrase. For example, use forms such as "Report submission," "Milk purchase," "Phone call with Mom," or "Email to Alex" when simply removing the verb would lose important meaning. Use sentence capitalization. Do not invent or remove relevant details.
5. Write every title in clear English. Correct spelling and grammar. Translate Chinese and mixed-language input into natural English while preserving intended meaning, names, numbers, places, links, and relevant details. Do not add requirements.
6. Assign exactly one relevant Unicode emoji to each item. Keep it in the emoji field, not the title. Variety is welcome, but similar tasks may repeat an emoji.
7. Assign every task one concise English subject label in subject. Infer it from the task meaning and normalize equivalent subjects to exactly the same label so related tasks group together. Use familiar labels such as History, Physics, Chinese, Mathematics, Biology, Chemistry, Computer Science, Art, Music, or General. Use General only when no more specific subject is clear.
8. English Language and English Literature are always distinct subjects. Use English Language for grammar, vocabulary, language practice, composition, and similar work; use English Literature for novels, poems, plays, literary analysis, and similar work. Never merge these two labels.
9. Set label to "Extra" when the user says a task is optional, can be done if there is time, is a bonus, or has equivalent meaning. Example: "This task is due today, but I’ll only do it if I have time" must keep today's due date and use label "Extra".
10. If the user explicitly supplies a custom task label, preserve their wording in label (including Chinese wording). Do not translate, normalize, or invent a custom label. Use an empty string when no optional meaning or custom label is stated. Labels are at most 40 characters.
11. Interpret due dates task by task from sentence meaning and structure. A date applies to multiple tasks only when the wording clearly gives them a shared deadline. Different dates must stay with their correct tasks.
12. If a task has no explicit or clearly shared deadline, use today (${today}) for that task, even when another task in the same input has a date.
13. Resolve relative dates such as today, tomorrow, this Friday, and next week using the local context above. Do not treat a date that merely describes a past event, meeting, trip, document, or other background information as a task deadline.
14. If a date has two or more reasonable deadline interpretations, set dateAmbiguous to true, choose the most likely tentative date for the editable date field, and put a short English confirmation question in dateQuestion. This includes an unqualified weekday such as "Friday" when it could mean today/this week's occurrence or the following week's occurrence, and a numeric date whose month/day order is unclear. Otherwise use false and an empty string.
15. day, month, and year must be integers. Return at most 30 tasks. If the input contains no actionable task, return {"tasks":[]}.`,
        },
        { role: "user", content: input },
      ],
    }),
  });

  const payload = await apiResponse.json().catch(() => null);
  if (!apiResponse.ok) {
    const message = payload?.error?.message || `DeepSeek request failed (${apiResponse.status}).`;
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("DeepSeek returned no task data.");
  return normalizeGeneratedTasks(JSON.parse(content));
}

async function parseEvent(input, timeZone) {
  const { today, localTime } = getLocalContext(timeZone);
  const apiResponse = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: "deepseek-flash",
      thinking: { type: "disabled" },
      max_tokens: 1_500,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extract one personal calendar event from Mandarin Chinese, English, or mixed-language input.

Current local context:
- IANA time zone: ${timeZone}
- Today: ${today}
- Current local date and time: ${localTime}

Return JSON only in exactly this shape:
{"event":{"title":"Trip","startDate":"2026-10-20","endDate":"2026-10-23","allDay":true,"holiday":false,"startTime":"","endTime":"","dateMissing":false,"dateAmbiguous":false,"clarificationQuestion":""}}

Rules:
1. Preserve the user's meaning and names. Correct spelling and produce a concise, natural English title.
2. Use inclusive ISO dates. For a single-day event, endDate equals startDate. Resolve relative dates using the local context.
3. Never invent a date. If no date is supplied, set dateMissing true, use empty date strings, and ask a short English clarificationQuestion.
4. If a date has multiple reasonable interpretations, set dateAmbiguous true, choose the most likely tentative dates, and ask a short English clarificationQuestion. Always treat an unqualified weekday such as "Friday" as ambiguous when it could reasonably mean this week's or next week's occurrence. Also flag numeric dates whose month/day order is unclear. Otherwise set dateAmbiguous false.
5. Set holiday true when the user describes a holiday, vacation, school break, public holiday, or named holiday period. Preserve its inclusive start and end dates, including when the range crosses a month or year. Otherwise set holiday false.
6. Holidays are all-day events: set allDay true and use empty time strings. For other events, never invent or require a time. When no specific time is given, set allDay true and use empty time strings.
7. When a specific time or time range is supplied for a non-holiday event, preserve it, set allDay false, and use 24-hour HH:MM values. A single supplied time must go in startTime and may use an empty endTime. Never return endTime without startTime.
8. Do not ask the user to clarify or supply a time when the time is omitted. Missing time always means an all-day event; clarificationQuestion is only for missing or ambiguous dates.
9. This is a personal event, not a completable task. Return exactly one event.`,
        },
        { role: "user", content: input },
      ],
    }),
  });

  const payload = await apiResponse.json().catch(() => null);
  if (!apiResponse.ok) {
    throw new Error(payload?.error?.message || `DeepSeek request failed (${apiResponse.status}).`);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("DeepSeek returned no event data.");
  return normalizeGeneratedEvent(JSON.parse(content));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/local-data") {
    sendJson(response, 200, readLocalData());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/local-data") {
    try {
      const body = await readJson(request, MAX_LOCAL_DATA_SIZE);
      const saved = writeLocalData(body?.data);
      sendJson(response, 200, { saved: true, updatedAt: saved.updatedAt });
    } catch (error) {
      console.error("Local data could not be saved:", error.message);
      sendJson(response, 400, { error: "Local data could not be saved." });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/transcribe") {
    if (!DOUBAO_SPEECH_API_KEY) {
      sendJson(response, 503, { error: "Doubao speech recognition is not configured on this computer." });
      return;
    }

    try {
      const audio = await readBinary(request);
      if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
        sendJson(response, 400, { error: "The recording was not a valid WAV audio file." });
        return;
      }
      const transcript = await transcribeWithDoubao(audio);
      if (!transcript) {
        sendJson(response, 422, { error: "No speech was detected. Check your microphone and try again." });
        return;
      }
      sendJson(response, 200, { transcript });
    } catch (error) {
      console.error("Doubao transcription failed:", error.message);
      const permissionMissing = error.message.includes("requested resource not granted");
      sendJson(response, 502, {
        error: permissionMissing
          ? "Doubao Speech Recognition 2.0 is not enabled for this API key's project. Enable the service in Volcengine, then retry."
          : "Doubao could not transcribe this recording. Please retry or continue typing.",
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/parse-tasks") {
    if (!API_KEY) {
      sendJson(response, 503, { error: "DeepSeek is not configured on this computer." });
      return;
    }

    try {
      const body = await readJson(request);
      const input = typeof body.input === "string" ? body.input.trim() : "";
      if (!input || input.length > MAX_INPUT_LENGTH) {
        sendJson(response, 400, { error: "Enter one or more tasks in 1–4,000 characters." });
        return;
      }

      const timeZone = resolveTimeZone(body.timeZone);
      const tasks = await parseTasks(input, timeZone);
      sendJson(response, 200, { tasks });
    } catch (error) {
      console.error("Task processing failed:", error.message);
      const timedOut = error.name === "TimeoutError";
      sendJson(response, 502, {
        error: timedOut
          ? "DeepSeek took too long to respond. Your input is preserved; please retry."
          : "DeepSeek could not process your tasks. Your input is preserved; please retry.",
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/parse-event") {
    if (!API_KEY) {
      sendJson(response, 503, { error: "DeepSeek is not configured on this computer. Use manual event entry instead." });
      return;
    }

    try {
      const body = await readJson(request);
      const input = typeof body.input === "string" ? body.input.trim() : "";
      if (!input || input.length > MAX_INPUT_LENGTH) {
        sendJson(response, 400, { error: "Describe one event in 1–4,000 characters." });
        return;
      }
      const timeZone = resolveTimeZone(body.timeZone);
      const event = await parseEvent(input, timeZone);
      sendJson(response, 200, { event });
    } catch (error) {
      console.error("Event processing failed:", error.message);
      sendJson(response, 502, {
        error: "DeepSeek could not interpret this event. Your text is preserved; use manual entry or try again.",
      });
    }
    return;
  }

  if (request.method === "GET" && STATIC_FILES.has(url.pathname)) {
    const [filename, contentType] = STATIC_FILES.get(url.pathname);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(path.join(ROOT, filename)).pipe(response);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Todo List running at http://127.0.0.1:${PORT}`);
});
