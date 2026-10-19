# Todo List Website

A responsive, AI-powered to-do list built with HTML, CSS, JavaScript, and a small Node.js server.

Current stable release: **v2.0**.

## 中文快速使用说明（含账号与邮箱验证码）

需要 Node.js 22.13 以上版本，推荐 Node.js 24。首次使用：

1. 在项目目录运行 `npm install`。
2. 将 `.env.example` 复制为 `.env`（已有 `.env` 时不要覆盖）。
3. 编辑本机 `.env`，填写下面的配置，再运行 `npm start`。
4. 浏览器打开 `http://127.0.0.1:4173`；登录、注册、找回密码入口在 `/account`。

| 配置项 | 怎么填 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 填自己的 DeepSeek API Key；没有配置时 Ask AI 无法处理待办。不要把 Key 发到聊天或提交到仓库。 |
| `SMTP_USER` | 发验证码的完整邮箱地址，例如你自己的 163 邮箱。 |
| `SMTP_PASS` | 该邮箱开启 SMTP 服务后生成的客户端授权码，**不是邮箱登录密码**。 |
| `SMTP_HOST` / `SMTP_PORT` | 163 邮箱使用 `smtp.163.com` / `465`，通过 TLS 加密连接。 |
| `AUTH_SECRET` | 随机密钥，至少 32 个字符。可在本机运行下方命令生成。 |
| `APP_ORIGIN` | 本地填 `http://127.0.0.1:4173`，必须与浏览器访问地址一致；部署时换成真实 HTTPS 网站地址。 |
| `AUTH_DB_PATH` | 默认 `./data/auth.sqlite`，用于保存账号和会话；请保留并备份此数据库。 |

生成 `AUTH_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**怎么换发信邮箱：** 在新邮箱设置里开启 SMTP 并取得客户端授权码，然后修改 `.env` 的 `SMTP_USER` 和 `SMTP_PASS`，重启 `npm start`。换成其他邮箱服务商时，还需修改服务器和端口；当前实现使用隐式 TLS，需要使用服务商对应的 TLS 端口，不能直接换成需要 STARTTLS 的 587 端口。

**不要漏配 DeepSeek Key。** 邮箱配置只负责验证码，`DEEPSEEK_API_KEY` 负责 AI 待办解析，二者独立。线上运行时需在服务器单独设置这些环境变量；GitHub 上的代码不会携带本机 `.env`，也不会自动部署。此项目需要 Node.js 后端，不能仅用静态 GitHub Pages 承载账号和发信接口。

验证码十分钟过期、只能使用一次，错误五次后需重新获取；同一邮箱至少间隔一分钟再发。重置密码后需要重新登录。待办仍保存在当前浏览器，不做账号云同步或按账号隔离。

**有任何问题，直接问 AI，让 AI 帮你排查和解决。** 可以把不含秘密的报错、操作步骤和相关代码交给 AI，让它检查配置、修改代码并运行测试。不要发送 `.env`、邮箱授权码、API Key、会话 Cookie 或账号数据库。可让 AI 先运行 `npm run check`、`npm test` 和 `npm run test:ui`（UI 测试需要 Chrome）。

测试使用模拟邮件，不发送真实邮件；SMTP 认证成功不等于已经验证真实邮件投递。

## Features

- Renameable list title
- Add one or many tasks using typed English, Mandarin Chinese, or mixed-language natural language
- Record tasks with the browser microphone and automatically transcribe them without showing live text
- The voice workflow is adapted from the companion `Test-audio-website` project and uses the browser Web Speech API; DeepSeek does not transcribe audio
- A reactive waveform, recording timer, stop control, and cancel control make recording state clear
- DeepSeek separates actionable work, corrects and translates task titles, resolves task-specific dates, and chooses one relevant emoji
- Review, edit, remove, and confirm generated tasks before saving
- Ambiguous dates are flagged and must be confirmed in the preview
- Every task is stored as an object with `date`, `task`, and `completed`
- Delete tasks
- Mark tasks complete with a checkbox
- Completed-task strikethrough
- Automatic local storage persistence
- Responsive and keyboard-accessible design

## Run locally

Use Node.js 22.13 or newer (Node 24 recommended). Install dependencies, then create a local environment file if one does not already exist:

```bash
npm install
cp .env.example .env
# Edit .env and replace the placeholder. Never commit this file.
npm start
```

Then visit `http://127.0.0.1:4173`.

Voice input works best in the latest Google Chrome. If microphone or speech-recognition access is unavailable, typed input continues to work normally.

## Accounts and email verification

Open `/account` or select **Account / Sign in** on the task page. Accounts support email-verified registration, password sign-in, sign-out, and email-verified password reset. Tasks remain in browser local storage, shared by accounts using that browser; account sign-in does not add cloud sync or isolate existing task lists. The task page remains available without signing in.

Configure only the server's local `.env` (never frontend JavaScript):

- `APP_ORIGIN`: exact URL used in the browser, locally `http://127.0.0.1:4173`. A different hostname such as `localhost` is a different origin.
- `AUTH_SECRET`: randomly generated secret, at least 32 characters. Generate one locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`; paste it into `.env`, not into chat.
- `AUTH_DB_PATH`: persistent SQLite file, default `./data/auth.sqlite`. Back up this directory securely; do not use an ephemeral deployment filesystem.
- `SMTP_HOST=smtp.163.com`, `SMTP_PORT=465`: TLS connection, certificate validation enabled.
- `SMTP_USER`: full 163 sender email address.
- `SMTP_PASS`: 163 **client authorization code**, not the mailbox login password. Enable the SMTP service in the mailbox's POP3/SMTP/IMAP settings and obtain a client authorization code. Do not commit or share this value.

Existing local configuration should be preserved. `.env`, `.env.*` (except `.env.example`) and `data/` are ignored by Git. The server serves only explicitly allowed static files. Missing email credentials produce an explicit service-unavailable response; no fake code is returned to the browser.

Security behavior:

- Passwords use salted scrypt hashes; session tokens are random, stored as hashes, and sent in HttpOnly / SameSite cookies. Sessions last seven days. Password reset revokes all sessions for the account.
- Six-digit verification codes are HMAC-hashed in SQLite, bound to email and purpose, expire after ten minutes, and are consumed once. Five failed checks invalidate a code.
- Sending is limited to once per minute and five attempts per hour per address, plus ten per hour per source IP. Failed deliveries also consume the send limit. New codes replace older codes for the same purpose.
- Account actions are rate-limited by IP and email; counters survive restarts. Requests require the configured same origin. Responses do not distinguish eligible versus ineligible addresses when requesting codes.
- This small server is intended to run as one Node process with a persistent local database. It binds to loopback. For deployment, use an HTTPS reverse proxy, `NODE_ENV=production`, and an HTTPS `APP_ORIGIN` (which enables Secure cookies). Proxy IP headers are deliberately not trusted, so clients behind a proxy share the proxy's IP limit until trusted-proxy handling is explicitly configured.

## Verification

```bash
npm run check
npm test
npm run test:ui
```

UI tests require installed Google Chrome and use port 4199. Tests use temporary databases and an injected mock mail sender; they never load `.env` or send real email. Screenshots are written to ignored `test-results/`. Integration tests cover persistence, verification expiry and reuse, attempt limits, concurrent resend requests, invalid input, CSRF, mail failures, login/logout, password reset and session revocation. SMTP connection/authentication verification alone does not verify message delivery.
