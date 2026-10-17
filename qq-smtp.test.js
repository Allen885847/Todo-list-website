const assert = require("node:assert/strict");
const fs = require("node:fs");

const smtp = fs.readFileSync("src/qq-smtp.mjs", "utf8");
const auth = fs.readFileSync("src/cloudflare-auth.mjs", "utf8");
const config = fs.readFileSync("wrangler.jsonc", "utf8");

assert.match(smtp, /await import\("cloudflare:sockets"\)/);
assert.match(smtp, /hostname: SMTP_HOST, port: SMTP_PORT/);
assert.match(smtp, /secureTransport: "on"/);
assert.match(smtp, /AUTH LOGIN/);
assert.match(smtp, /MAIL FROM:<\$\{from\}>/);
assert.match(smtp, /RCPT TO:<\$\{to\}>/);
assert.match(smtp, /Content-Type: multipart\/alternative/);
assert.match(smtp, /replace\(\/\(\^\|\\r\\n\)\\\.\/g, "\$1\.\."\)/);
assert.match(auth, /"QQ_SMTP_USER"/);
assert.match(auth, /"QQ_SMTP_AUTH_CODE"/);
assert.match(auth, /await sendQQEmail\(env/);
assert.match(auth, /sendOnSignUp: false/);
assert.match(auth, /sendOnSignIn: false/);
assert.doesNotMatch(auth, /backgroundTasks/);
assert.doesNotMatch(auth, /RESEND_API_KEY|api\.resend\.com/);
assert.match(config, /"QQ_SMTP_FROM_NAME": "Todo List"/);
assert.doesNotMatch(config, /EMAIL_FROM/);

(async () => {
  const { buildMimeMessage } = await import("./src/qq-smtp.mjs");
  const message = buildMimeMessage({
    from: "sender@qq.com",
    to: "student@example.com",
    subject: "Verify 测试",
    text: "Plain verification link",
    html: `<p>${"HTML verification link ".repeat(120)}</p>`,
  });
  assert.match(message, /From: =\?UTF-8\?B\?.+\?= <sender@qq\.com>/);
  assert.match(message, /To: <student@example\.com>/);
  assert.match(message, /Subject: =\?UTF-8\?B\?.+\?=/);
  assert.match(message, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(message, /Content-Type: text\/html; charset=UTF-8/);
  for (const line of message.split("\r\n")) {
    assert.ok(line.length <= 998, "SMTP message lines must stay within RFC limits");
  }
  assert.throws(() => buildMimeMessage({
    from: "sender@qq.com\r\nBcc: attacker@example.com",
    to: "student@example.com",
    subject: "Bad",
    text: "Bad",
    html: "Bad",
  }), /valid sender/);
  console.log("QQ SMTP transport, MIME generation, and authentication wiring passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
