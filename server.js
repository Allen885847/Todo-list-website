const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 4173;
const API_KEY = process.env.DEEPSEEK_API_KEY;
const ROOT = __dirname;
const MAX_BODY_SIZE = 30_000;
const MAX_INPUT_LENGTH = 4_000;
const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/script.js", ["script.js", "text/javascript; charset=utf-8"]],
]);

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
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
    const emoji = typeof item?.emoji === "string" ? item.emoji.trim() : "";
    const dateAmbiguous = item?.dateAmbiguous === true;
    const dateQuestion = typeof item?.dateQuestion === "string" ? item.dateQuestion.trim() : "";

    if (!title || title.length > 200 || !isSingleEmoji(emoji) || !isValidDate(item?.date)) {
      throw new Error("DeepSeek returned an invalid task.");
    }
    if (dateAmbiguous && !dateQuestion) {
      throw new Error("DeepSeek omitted an ambiguous-date question.");
    }

    return {
      title,
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
{"tasks":[{"title":"Clear concise English task title","emoji":"📚","date":{"day":9,"month":10,"year":2026},"dateAmbiguous":false,"dateQuestion":""}]}

Rules:
1. Create one item for every independently actionable task. Keep supporting details with their relevant task. Do not invent tasks, omit explicit actions, or turn background details into tasks.
2. Every title MUST begin with a concise present-tense imperative action verb. Never return a noun-only label such as "Math worksheet" or "History website." Apply this rule to each task independently and identically: the same underlying task must receive the same title whether it appears alone or inside a multi-task request. Batch size, neighboring tasks, and input order must not change its naming style.
3. Use a stable canonical verb for the user's intended action. Prefer "Complete" for doing worksheets, homework, forms, exercises, and assignments; "Review" for studying; "Create" for making something; and specific verbs such as "Submit," "Send," "Email," "Call," "Buy," "Read," "Write," "Update," "Fix," "Prepare," or "Schedule" when they accurately match the request. For example, "I need to do a math worksheet" must be "Complete the math worksheet" in both single-task and multi-task input. Keep titles concise, use sentence capitalization, and do not add an action the user did not mean.
4. Write every title in clear English. Correct spelling and grammar. Translate Chinese and mixed-language input into natural English while preserving intended meaning, names, numbers, places, links, and relevant details. Do not add requirements.
5. Assign exactly one relevant Unicode emoji to each item. Keep it in the emoji field, not the title. Variety is welcome, but similar tasks may repeat an emoji.
6. Interpret due dates task by task from sentence meaning and structure. A date applies to multiple tasks only when the wording clearly gives them a shared deadline. Different dates must stay with their correct tasks.
7. If a task has no explicit or clearly shared deadline, use today (${today}) for that task, even when another task in the same input has a date.
8. Resolve relative dates such as today, tomorrow, this Friday, and next week using the local context above. Do not treat a date that merely describes a past event, meeting, trip, document, or other background information as a task deadline.
9. If a date has two or more reasonable deadline interpretations, set dateAmbiguous to true, choose the most likely tentative date for the editable date field, and put a short English confirmation question in dateQuestion. This includes an unqualified weekday such as "Friday" when it could mean today/this week's occurrence or the following week's occurrence, and a numeric date whose month/day order is unclear. Otherwise use false and an empty string.
10. day, month, and year must be integers. Return at most 30 tasks. If the input contains no actionable task, return {"tasks":[]}.`,
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

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

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
