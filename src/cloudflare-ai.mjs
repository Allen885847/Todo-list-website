const MAX_JSON_BYTES = 30_000;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_LENGTH = 4_000;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function readJson(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw new Error("REQUEST_TOO_LARGE");
  return JSON.parse(text);
}

function resolveTimeZone(value) {
  const timeZone = typeof value === "string" && value.length <= 100 ? value : "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone }).format(); return timeZone; } catch { return "UTC"; }
}

function localContext(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return {
    today: `${part("year")}-${part("month")}-${part("day")}`,
    localTime: new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "full", timeStyle: "long" }).format(now),
  };
}

function validDate(value) {
  if (!value || ![value.day, value.month, value.year].every(Number.isInteger)) return false;
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  return value.year >= 2000 && value.year <= 2200
    && date.getUTCFullYear() === value.year && date.getUTCMonth() === value.month - 1 && date.getUTCDate() === value.day;
}

function validIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validEmoji(value) {
  return typeof value === "string" && value.length <= 20 && /\p{Extended_Pictographic}/u.test(value.trim());
}

function normalizeTasks(payload) {
  if (!Array.isArray(payload?.tasks) || payload.tasks.length > 30) throw new Error("INVALID_AI_RESULT");
  return payload.tasks.map((item) => {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    const subject = typeof item?.subject === "string" ? item.subject.trim() : "";
    const label = typeof item?.label === "string" ? item.label.trim().replace(/\s+/g, " ") : "";
    const emoji = typeof item?.emoji === "string" ? item.emoji.trim() : "";
    const dateQuestion = typeof item?.dateQuestion === "string" ? item.dateQuestion.trim().slice(0, 240) : "";
    const dateAmbiguous = item?.dateAmbiguous === true;
    if (!title || title.length > 200 || !subject || subject.length > 80 || label.length > 40
      || !validEmoji(emoji) || !validDate(item?.date) || (dateAmbiguous && !dateQuestion)) {
      throw new Error("INVALID_AI_RESULT");
    }
    return { title, subject, label, emoji, date: item.date, dateAmbiguous, dateQuestion: dateAmbiguous ? dateQuestion : "" };
  });
}

function normalizeEvent(payload) {
  const item = payload?.event;
  const title = typeof item?.title === "string" ? item.title.trim() : "";
  const dateMissing = item?.dateMissing === true;
  const dateAmbiguous = item?.dateAmbiguous === true;
  const holiday = item?.holiday === true;
  const startDate = typeof item?.startDate === "string" ? item.startDate : "";
  const endDate = typeof item?.endDate === "string" ? item.endDate : startDate;
  const startTime = typeof item?.startTime === "string" ? item.startTime : "";
  const endTime = typeof item?.endTime === "string" ? item.endTime : "";
  const clarificationQuestion = typeof item?.clarificationQuestion === "string" ? item.clarificationQuestion.trim().slice(0, 240) : "";
  const validTime = (value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const allDay = holiday || startTime === "";
  if (!title || title.length > 200 || !validTime(startTime) || !validTime(endTime) || (endTime && !startTime)) {
    throw new Error("INVALID_AI_RESULT");
  }
  if (!dateMissing && (!validIsoDate(startDate) || !validIsoDate(endDate) || endDate < startDate)) throw new Error("INVALID_AI_RESULT");
  if ((dateMissing || dateAmbiguous) && !clarificationQuestion) throw new Error("INVALID_AI_RESULT");
  return {
    title, startDate: dateMissing ? "" : startDate, endDate: dateMissing ? "" : endDate,
    allDay, holiday, startTime: allDay ? "" : startTime, endTime: allDay ? "" : endTime,
    dateMissing, dateAmbiguous, clarificationQuestion,
  };
}

async function callDeepSeek(env, messages, maxTokens) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-flash",
      thinking: { type: "disabled" }, temperature: 0, max_tokens: maxTokens,
      response_format: { type: "json_object" }, messages,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `DeepSeek request failed (${response.status}).`);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("DeepSeek returned no structured data.");
  return JSON.parse(content);
}

async function parseTasks(env, input, timeZone) {
  const { today, localTime } = localContext(timeZone);
  const system = `Turn Mandarin, English, or mixed-language plans into an editable task preview.
Local time zone: ${timeZone}. Today: ${today}. Current local time: ${localTime}.
Return JSON only: {"tasks":[{"title":"Math worksheet","subject":"Mathematics","label":"Extra","emoji":"📝","date":{"day":16,"month":10,"year":2026},"dateAmbiguous":false,"dateQuestion":""}]}.
Rules:
1. Create one item for every independently actionable task. Preserve supporting details and never invent or omit actions.
2. Every title must be concise natural English and a noun phrase without a leading action verb. Remove conversational framing. Never begin with Complete, Do, Finish, Review, Create, Submit, Send, Buy, or Prepare. Examples: “do a math worksheet” → “Math worksheet”; “Review for my history test” → “History test review”; “Complete the physics website homework” → “Physics website homework”. The same task must get the same title alone or in a batch.
3. Preserve names, numbers, places, links, and meaning. Correct grammar and translate Chinese naturally.
4. Give exactly one relevant Unicode emoji in emoji, never in title.
5. Give one concise English subject. Normalize related subjects. Keep English Language and English Literature separate. Use General only when necessary.
6. Use label “Extra” for optional/if-there-is-time/bonus tasks. Preserve an explicitly supplied custom label exactly, including Chinese. Otherwise label is empty.
7. Interpret dates per task from sentence meaning. Share a date only when wording clearly shares it. For a task without a clear deadline, use today (${today}) even when other tasks have dates. Resolve relative dates in the user’s time zone. Background dates are not deadlines.
8. If a deadline has multiple reasonable interpretations, set dateAmbiguous true, choose the likeliest tentative date, and ask a short English dateQuestion. Otherwise use false and empty dateQuestion.
9. Date parts are integers. Return at most 30 tasks. If no actionable task exists return {"tasks":[]}.`;
  return normalizeTasks(await callDeepSeek(env, [{ role: "system", content: system }, { role: "user", content: input }], 4_000));
}

async function parseEvent(env, input, timeZone) {
  const { today, localTime } = localContext(timeZone);
  const system = `Extract exactly one personal calendar event from Mandarin, English, or mixed-language input.
Local time zone: ${timeZone}. Today: ${today}. Current local time: ${localTime}.
Return JSON only: {"event":{"title":"Study group","startDate":"2026-10-20","endDate":"2026-10-20","allDay":false,"holiday":false,"startTime":"15:00","endTime":"16:00","dateMissing":false,"dateAmbiguous":false,"clarificationQuestion":""}}.
Preserve meaning and names; use a concise natural English title. Use inclusive ISO dates and resolve relative dates locally. Never invent a date: if missing, set dateMissing true, empty dates, and ask a short clarificationQuestion. If ambiguous, choose a tentative date, set dateAmbiguous true, and ask a short question. Holiday, vacation, school break, and public-holiday ranges set holiday true and include every start/end day across months or years. Holidays have no times. For other events, preserve supplied time or range as 24-hour HH:MM. If only a start time exists, leave endTime empty. If no time exists, leave both time strings empty and set allDay true. Never ask for an omitted time. This is an event, not a task.`;
  return normalizeEvent(await callDeepSeek(env, [{ role: "system", content: system }, { role: "user", content: input }], 1_500));
}

function concatBytes(...parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { output.set(new Uint8Array(part.buffer || part, part.byteOffset || 0, part.byteLength), offset); offset += part.byteLength; }
  return output;
}

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function doubaoPacket(messageType, flags, payload, { jsonPayload = false } = {}) {
  const source = jsonPayload ? new TextEncoder().encode(JSON.stringify(payload)) : new Uint8Array(payload);
  const body = await gzip(source);
  const header = new Uint8Array([0x11, (messageType << 4) | flags, ((jsonPayload ? 1 : 0) << 4) | 1, 0]);
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, body.byteLength, false);
  return concatBytes(header, size, body);
}

async function parseDoubaoMessage(input) {
  const packet = input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : new Uint8Array(input);
  if (packet.byteLength < 4) throw new Error("Incomplete Doubao response.");
  const headerSize = (packet[0] & 0x0f) * 4;
  const messageType = packet[1] >> 4;
  const flags = packet[1] & 0x0f;
  const serialization = packet[2] >> 4;
  const compression = packet[2] & 0x0f;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  let offset = headerSize;
  if (messageType === 0x0f) {
    const code = view.getUint32(offset, false);
    const length = view.getUint32(offset + 4, false);
    offset += 8;
    let body = packet.slice(offset, offset + length);
    if (compression === 1) body = await gunzip(body);
    throw new Error(`Doubao transcription failed (${code}): ${new TextDecoder().decode(body)}`);
  }
  if (flags === 1 || flags === 3 || messageType === 0x09 || messageType === 0x0b) offset += 4;
  if (packet.byteLength < offset + 4) return null;
  const length = view.getUint32(offset, false);
  offset += 4;
  let body = packet.slice(offset, offset + length);
  if (compression === 1 && body.byteLength) body = await gunzip(body);
  if (!body.byteLength || serialization !== 1) return null;
  return JSON.parse(new TextDecoder().decode(body));
}

function transcriptFrom(payload) {
  if (typeof payload?.result?.text === "string") return payload.result.text.trim();
  if (Array.isArray(payload?.result)) return payload.result.map((item) => item?.text || item?.result?.text || "").join("").trim();
  return typeof payload?.text === "string" ? payload.text.trim() : "";
}

async function transcribe(env, audio) {
  const requestId = crypto.randomUUID();
  const response = await fetch("https://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream", {
    headers: {
      Upgrade: "websocket",
      "X-Api-Key": env.DOUBAO_SPEECH_API_KEY,
      "X-Api-Resource-Id": env.DOUBAO_SPEECH_RESOURCE_ID || "volc.seedasr.sauc.duration",
      "X-Api-Request-Id": requestId,
      "X-Api-Connect-Id": requestId,
    },
  });
  const socket = response.webSocket;
  if (!socket) throw new Error(`Doubao rejected the WebSocket connection (${response.status}).`);
  socket.accept();
  const requestPacket = await doubaoPacket(0x01, 0x00, {
    user: { uid: "todo-list-online" },
    audio: { format: "wav", codec: "raw", rate: 16000, bits: 16, channel: 1 },
    request: { model_name: "bigmodel", enable_itn: true, enable_punc: true, enable_ddc: true, show_utterances: false, result_type: "full" },
  }, { jsonPayload: true });
  const audioPacket = await doubaoPacket(0x02, 0x02, audio);
  return new Promise((resolve, reject) => {
    let settled = false;
    let latest = "";
    const timer = setTimeout(() => finish(new Error("Doubao transcription timed out.")), 55_000);
    const finish = (error, text = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      if (error) reject(error); else resolve(text);
    };
    socket.addEventListener("message", async (event) => {
      try {
        const payload = await parseDoubaoMessage(event.data);
        const value = transcriptFrom(payload);
        if (value) latest = value;
        if (payload?.result && latest) finish(null, latest);
      } catch (error) { finish(error); }
    });
    socket.addEventListener("error", () => finish(new Error("Doubao connection failed.")));
    socket.addEventListener("close", () => finish(latest ? null : new Error("No speech was detected."), latest));
    socket.send(requestPacket);
    socket.send(audioPacket);
  });
}

async function logMessage(env, userId, type, inputMethod, userContent, result, status, errorCode = null) {
  try {
    await env.DB.prepare(`INSERT INTO messages
      (id, user_id, conversation_type, input_method, user_content, assistant_content, provider, model, status, error_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'deepseek', ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), userId, type, inputMethod, userContent, result ? JSON.stringify(result) : null,
        env.DEEPSEEK_MODEL || "deepseek-flash", status, errorCode, new Date().toISOString()).run();
  } catch { /* Logging must never block the user's request. */ }
}

export async function handleAiRequest(request, env, userId) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/api/transcribe") {
    if (!env.DOUBAO_SPEECH_API_KEY) return json({ error: "Voice recognition is not configured." }, 503);
    const audio = await request.arrayBuffer();
    const bytes = new Uint8Array(audio);
    if (bytes.byteLength > MAX_AUDIO_BYTES) return json({ error: "The recording is too large." }, 413);
    if (bytes.byteLength < 44 || new TextDecoder("ascii").decode(bytes.slice(0, 4)) !== "RIFF"
      || new TextDecoder("ascii").decode(bytes.slice(8, 12)) !== "WAVE") {
      return json({ error: "The recording was not a valid WAV audio file." }, 400);
    }
    try {
      const transcript = await transcribe(env, audio);
      return transcript ? json({ transcript }) : json({ error: "No speech was detected. Check your microphone and try again." }, 422);
    } catch {
      return json({ error: "Doubao could not transcribe this recording. Please retry or continue typing." }, 502);
    }
  }

  const isTask = request.method === "POST" && url.pathname === "/api/parse-tasks";
  const isEvent = request.method === "POST" && url.pathname === "/api/parse-event";
  if (!isTask && !isEvent) return null;
  if (!env.DEEPSEEK_API_KEY) return json({ error: "DeepSeek is not configured." }, 503);
  let input = "";
  let inputMethod = "typed";
  try {
    const body = await readJson(request);
    input = typeof body.input === "string" ? body.input.trim() : "";
    inputMethod = body.inputMethod === "voice" ? "voice" : "typed";
    if (!input || input.length > MAX_INPUT_LENGTH) return json({ error: isTask ? "Enter one or more tasks in 1–4,000 characters." : "Describe one event in 1–4,000 characters." }, 400);
    const timeZone = resolveTimeZone(body.timeZone);
    const result = isTask ? { tasks: await parseTasks(env, input, timeZone) } : { event: await parseEvent(env, input, timeZone) };
    await logMessage(env, userId, isTask ? "task_generation" : "event_generation", inputMethod, input, result, "success");
    return json(result);
  } catch (error) {
    await logMessage(env, userId, isTask ? "task_generation" : "event_generation", inputMethod, input, null, "failed", error?.message || "PROCESSING_FAILED");
    return json({ error: isTask
      ? "DeepSeek could not process your tasks. Your input is preserved; please retry."
      : "DeepSeek could not interpret this event. Your text is preserved; use manual entry or try again." }, 502);
  }
}
