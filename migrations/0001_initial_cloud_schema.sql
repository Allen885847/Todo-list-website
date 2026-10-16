PRAGMA foreign_keys = ON;

-- Better Auth core tables. These names and columns follow its SQLite/D1 model.
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "account_provider_unique" ON "account" ("providerId", "accountId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER,
  "updatedAt" INTEGER
);

CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "subject" TEXT NOT NULL DEFAULT '',
  "emoji" TEXT NOT NULL DEFAULT '',
  "due_date" TEXT,
  "completed" INTEGER NOT NULL DEFAULT 0 CHECK ("completed" IN (0, 1)),
  "completed_at" TEXT,
  "deleted_at" TEXT,
  "sort_order" REAL NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS "tasks_user_due_idx" ON "tasks" ("user_id", "due_date", "sort_order");
CREATE INDEX IF NOT EXISTS "tasks_user_updated_idx" ON "tasks" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "events" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "event_type" TEXT NOT NULL DEFAULT 'event' CHECK ("event_type" IN ('event', 'schedule', 'holiday', 'birthday', 'trip')),
  "start_date" TEXT NOT NULL,
  "end_date" TEXT,
  "start_time" TEXT,
  "end_time" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "notes" TEXT NOT NULL DEFAULT '',
  "deleted_at" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);

CREATE INDEX IF NOT EXISTS "events_user_date_idx" ON "events" ("user_id", "start_date", "end_date");
CREATE INDEX IF NOT EXISTS "events_user_updated_idx" ON "events" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "labels" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#5f7fa3',
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  UNIQUE ("user_id", "normalized_name")
);

CREATE TABLE IF NOT EXISTS "task_labels" (
  "task_id" TEXT NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "label_id" TEXT NOT NULL REFERENCES "labels"("id") ON DELETE CASCADE,
  PRIMARY KEY ("task_id", "label_id")
);

CREATE TABLE IF NOT EXISTS "user_settings" (
  "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "appearance" TEXT NOT NULL DEFAULT 'system' CHECK ("appearance" IN ('light', 'dark', 'system')),
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "locale" TEXT NOT NULL DEFAULT 'en',
  "week_starts_on" INTEGER NOT NULL DEFAULT 1 CHECK ("week_starts_on" BETWEEN 0 AND 6),
  "calendar_default_view" TEXT NOT NULL DEFAULT 'month' CHECK ("calendar_default_view" IN ('day', 'week', 'month', 'year')),
  "todo_title" TEXT NOT NULL DEFAULT 'My To-Do List',
  "updated_at" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "conversation_type" TEXT NOT NULL CHECK ("conversation_type" IN ('task_generation', 'task_rewrite', 'event_generation')),
  "input_method" TEXT NOT NULL CHECK ("input_method" IN ('typed', 'voice')),
  "user_content" TEXT NOT NULL,
  "assistant_content" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT,
  "status" TEXT NOT NULL CHECK ("status" IN ('pending', 'success', 'failed')),
  "error_code" TEXT,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "messages_user_created_idx" ON "messages" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "data_imports" (
  "migration_id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "source" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  UNIQUE ("user_id", "content_hash")
);
