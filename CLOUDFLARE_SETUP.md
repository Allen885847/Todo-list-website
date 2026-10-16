# Cloudflare online setup

The `Online-1.0` branch contains a local Cloudflare foundation. It does not enable account creation or cloud data writes until authentication, email delivery, and abuse protection are configured.

## Architecture

- Workers Static Assets serves the existing HTML, CSS, JavaScript, and icons.
- A Cloudflare Worker owns every `/api/*` request.
- D1 stores authentication records, tasks, events, holidays, labels, settings, AI messages, and idempotent import records.
- R2 stores private exports, attachments, optional temporary audio, and long-term database exports.
- Better Auth will provide email/password sessions.
- Resend will deliver email verification and password-reset messages.
- Turnstile will protect registration, sign-in, and recovery endpoints.

## What the owner needs to prepare

1. A Cloudflare account. Prefer `npx wrangler login` on the development computer; do not send the Cloudflare password or API token to anyone.
2. A domain managed by Cloudflare, or approval to begin on the generated `workers.dev` domain.
3. A D1 database named `todo-list-online`.
4. A private R2 bucket named `todo-list-online-files`.
5. A transactional email provider. The planned provider is Resend, with a verified sending domain and a sender such as `Todo List <no-reply@your-domain>`.
6. A Turnstile widget for the production hostname. Keep its secret key private; the site key is public.
7. A decision about how long AI message history should be retained. The recommended default is 90 days, with a user control to delete it sooner.

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

## Create hosted resources

Run these only after Wrangler is signed into the intended Cloudflare account:

```sh
npx wrangler d1 create todo-list-online
npx wrangler r2 bucket create todo-list-online-files
```

Replace the zero UUID in `wrangler.jsonc` with the D1 `database_id` returned by Cloudflare. Keep resource IDs in configuration, but keep secret values out of Git.

Configure secrets interactively so they never appear in shell history or source files:

```sh
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put DOUBAO_SPEECH_API_KEY
```

Before the first production deployment, set `BETTER_AUTH_URL`, `EMAIL_FROM`, and the production environment in `wrangler.jsonc`, then apply migrations with `npm run cloudflare:migrate:remote`.

## Safety rules

- No API may trust a `user_id` supplied by the browser. It must come from the verified server session.
- Every task, event, label, setting, message, import, and R2 object key must be scoped to that session user.
- A newly registered account starts empty.
- Existing local data is imported only after the user explicitly approves it.
- Every import has a content hash and migration ID so repeating it cannot duplicate records.
- Local data is backed up before import and is not deleted after a successful cloud migration.
- D1 migrations are append-only after production deployment.
