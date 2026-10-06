const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 4173;
const API_KEY = process.env.DEEPSEEK_API_KEY;
const ROOT = __dirname;
const MAX_BODY_SIZE = 10_000;
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

    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
        reject(new Error("Request is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request must contain valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function isValidTask(todo) {
  if (!todo || typeof todo.task !== "string" || !todo.task.trim()) return false;
  if (todo.completed !== false) return false;
  if (!/^\p{Extended_Pictographic}/u.test(todo.task.trim())) return false;

  const { day, month, year } = todo.date || {};
  if (![day, month, year].every(Number.isInteger)) return false;

  const parsed = new Date(year, month - 1, day);
  return (
    year >= 2000 &&
    year <= 2200 &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

async function parseTask(input) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const apiResponse = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-flash",
      thinking: { type: "disabled" },
      max_tokens: 200,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `Extract one todo item from natural language. Today is ${today} in Asia/Hong_Kong. ` +
            "Resolve relative dates such as tomorrow and next Friday. If no date is stated, use today's date. " +
            "Identify what kind of task it is, choose exactly one relevant Unicode emoji commonly available in Apple's built-in emoji keyboard, " +
            "and place that emoji at the very beginning of the task string followed by one space. " +
            "Return JSON only in exactly this shape: " +
            '{"date":{"day":1,"month":1,"year":2026},"task":"📚 task description","completed":false}. ' +
            "day, month, and year must be integers. completed must always be false. Keep task concise and preserve the user's language.",
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
  const todo = JSON.parse(content);
  if (!isValidTask(todo)) throw new Error("DeepSeek returned an invalid task.");

  todo.task = todo.task.trim().slice(0, 200);
  return todo;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "POST" && url.pathname === "/api/parse-task") {
    if (!API_KEY) {
      sendJson(response, 503, { error: "The server is missing DEEPSEEK_API_KEY." });
      return;
    }

    try {
      const body = await readJson(request);
      const input = typeof body.input === "string" ? body.input.trim() : "";
      if (!input || input.length > 300) {
        sendJson(response, 400, { error: "Describe one task in 1–300 characters." });
        return;
      }

      const todo = await parseTask(input);
      sendJson(response, 200, { task: todo });
    } catch (error) {
      console.error("Task parsing failed:", error.message);
      sendJson(response, 502, { error: "AI could not parse that task. Please try again." });
    }
    return;
  }

  if (request.method === "GET" && STATIC_FILES.has(url.pathname)) {
    const [filename, contentType] = STATIC_FILES.get(url.pathname);
    response.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(path.join(ROOT, filename)).pipe(response);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Todo List running at http://127.0.0.1:${PORT}`);
});
