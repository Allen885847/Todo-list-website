CREATE TABLE IF NOT EXISTS "user_snapshots" (
  "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "data_json" TEXT NOT NULL DEFAULT '{}',
  "updated_at" TEXT NOT NULL
);
