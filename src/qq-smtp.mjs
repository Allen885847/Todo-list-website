const SMTP_HOST = "smtp.qq.com";
const SMTP_PORT = 465;
const OPERATION_TIMEOUT_MS = 20_000;

function withTimeout(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out.`)), OPERATION_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function validEmail(value) {
  return typeof value === "string"
    && value.length <= 254
    && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)
    && !/[\r\n]/.test(value);
}

function headerValue(value) {
  const clean = String(value).replace(/[\r\n]+/g, " ").trim();
  return `=?UTF-8?B?${base64Utf8(clean)}?=`;
}

function normalizeLines(value) {
  return String(value).replace(/\r?\n/g, "\r\n");
}

export function buildMimeMessage({ from, fromName = "Todo List", to, subject, text, html }) {
  if (!validEmail(from) || !validEmail(to)) throw new Error("A valid sender and recipient are required.");
  const boundary = `todo_${crypto.randomUUID().replaceAll("-", "")}`;
  return [
    `From: ${headerValue(fromName)} <${from}>`,
    `To: <${to}>`,
    `Subject: ${headerValue(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@todo-list-online>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Utf8(normalizeLines(text)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Utf8(normalizeLines(html)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

class SmtpSession {
  constructor(socket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
    this.decoder = new TextDecoder();
    this.buffer = "";
  }

  async write(value) {
    await withTimeout(this.writer.write(new TextEncoder().encode(value)), "SMTP write");
  }

  async readLine() {
    while (!this.buffer.includes("\n")) {
      const { value, done } = await withTimeout(this.reader.read(), "SMTP response");
      if (done) throw new Error("QQ SMTP closed the connection unexpectedly.");
      this.buffer += this.decoder.decode(value, { stream: true });
      if (this.buffer.length > 64_000) throw new Error("QQ SMTP returned an oversized response.");
    }
    const end = this.buffer.indexOf("\n") + 1;
    const line = this.buffer.slice(0, end).replace(/\r?\n$/, "");
    this.buffer = this.buffer.slice(end);
    return line;
  }

  async response(expectedCodes) {
    const first = await this.readLine();
    const match = /^(\d{3})([ -])/.exec(first);
    if (!match) throw new Error("QQ SMTP returned an invalid response.");
    const code = Number(match[1]);
    let detail = first;
    if (match[2] === "-") {
      while (true) {
        const line = await this.readLine();
        detail += `\n${line}`;
        if (line.startsWith(`${match[1]} `)) break;
      }
    }
    if (!expectedCodes.includes(code)) {
      throw new Error(`QQ SMTP rejected the request (${code}): ${detail.slice(0, 500)}`);
    }
    return detail;
  }

  async command(command, expectedCodes) {
    await this.write(`${command}\r\n`);
    return this.response(expectedCodes);
  }

  async close() {
    try { this.reader.releaseLock(); } catch { /* Already released. */ }
    try { this.writer.releaseLock(); } catch { /* Already released. */ }
    try { await this.socket.close(); } catch { /* Already closed. */ }
  }
}

export async function sendQQEmail(env, { to, subject, text, html }) {
  const from = String(env.QQ_SMTP_USER || "").trim();
  const authorizationCode = String(env.QQ_SMTP_AUTH_CODE || "").trim();
  if (!validEmail(from) || !authorizationCode) throw new Error("QQ SMTP is not configured.");
  if (!validEmail(to)) throw new Error("The recipient email address is invalid.");

  const { connect } = await import("cloudflare:sockets");
  const socket = connect({ hostname: SMTP_HOST, port: SMTP_PORT }, {
    secureTransport: "on",
    allowHalfOpen: true,
  });
  await withTimeout(socket.opened, "QQ SMTP connection");
  const session = new SmtpSession(socket);
  try {
    await session.response([220]);
    await session.command("EHLO todo-list-online", [250]);
    await session.command("AUTH LOGIN", [334]);
    await session.command(base64Utf8(from), [334]);
    await session.command(base64Utf8(authorizationCode), [235]);
    await session.command(`MAIL FROM:<${from}>`, [250]);
    await session.command(`RCPT TO:<${to}>`, [250, 251]);
    await session.command("DATA", [354]);
    const message = buildMimeMessage({
      from,
      fromName: env.QQ_SMTP_FROM_NAME || "Todo List",
      to,
      subject,
      text,
      html,
    });
    const dotStuffed = message.replace(/(^|\r\n)\./g, "$1..");
    await session.write(`${dotStuffed}\r\n.\r\n`);
    await session.response([250]);
    await session.command("QUIT", [221]);
  } finally {
    await session.close();
  }
}
