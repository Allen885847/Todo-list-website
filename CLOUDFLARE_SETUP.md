# Cloudflare online setup

The `Online-1.0` branch is deployed at `https://todolist.uno`. The original `https://todo-list-online.allenwhy888.workers.dev` hostname remains available as a recovery route.

## Architecture

- Workers Static Assets serves the existing HTML, CSS, JavaScript, and icons.
- A Cloudflare Worker owns every `/api/*` request.
- D1 stores authentication records, tasks, events, holidays, labels, settings, AI messages, idempotent import records, and per-account application snapshots.
- R2 stores a private latest-known-good recovery copy of each account snapshot. Audio recordings are processed in memory and are not stored.
- Better Auth provides email/password sessions.
- QQ Mail SMTP delivers email verification and password-reset messages over implicit TLS.
- Turnstile will protect registration, sign-in, and recovery endpoints.

## Deployed resources

- Cloudflare account: `allenwhy888@gmail.com`
- D1 database: `todo-list-online`
- Private R2 bucket: `todo-list-online-files`
- Worker: `todo-list-online`
- Turnstile widget: configured for `todolist.uno` and the recovery `workers.dev` hostname
- DeepSeek and Doubao credentials: stored only as Cloudflare Worker secrets
- Better Auth encryption secret: stored only as a Cloudflare Worker secret

## Remaining owner-provided items

A QQ mailbox must be enabled for SMTP before public registration and password reset can be activated. Provide:

1. The complete QQ email address, such as `123456789@qq.com`.
2. A QQ Mail SMTP authorization code generated after enabling IMAP/SMTP or POP3/SMTP. Do not use the QQ login password.

The address is stored as the private `QQ_SMTP_USER` Worker secret and the authorization code as `QQ_SMTP_AUTH_CODE`. The application connects to `smtp.qq.com:465` with implicit TLS. A custom domain is not required.

## Local preparation

After installing dependencies, copy `.dev.vars.example` to `.dev.vars` and add secrets locally. Never commit `.dev.vars`.

```sh
npm install better-auth
npm install --save-dev wrangler @cloudflare/workers-types
npm run cloudflare:build
npx wrangler d1 migrations apply todo-list-online --local
npx wrangler dev
```

The local health endpoint will be `http://localhost:8787/api/health`.

## Recreate hosted resources

Run these only after Wrangler is signed into the intended Cloudflare account:

```sh
npx wrangler d1 create todo-list-online
npx wrangler r2 bucket create todo-list-online-files
```

Replace the zero UUID in `wrangler.jsonc` with the D1 `database_id` returned by Cloudflare. Keep resource IDs in configuration, but keep secret values out of Git.

Configure secrets interactively so they never appear in shell history or source files:

```sh
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put QQ_SMTP_USER
npx wrangler secret put QQ_SMTP_AUTH_CODE
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put DOUBAO_SPEECH_API_KEY
```

Upload both QQ values with `wrangler secret put`, send a real verification email, then redeploy. `BETTER_AUTH_URL`, Turnstile, D1, R2, and production mode are already configured.

## Safety rules

- No API may trust a `user_id` supplied by the browser. It must come from the verified server session.
- Every task, event, label, setting, message, import, and R2 object key must be scoped to that session user.
- A newly registered account starts empty.
- Existing local data is imported only after the user explicitly approves it.
- Every import has a content hash and migration ID so repeating it cannot duplicate records.
- Local data is backed up before import and is not deleted after a successful cloud migration.
- D1 migrations are append-only after production deployment.
