const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "todo-cloud-schema-"));
const database = path.join(tempDir, "test.sqlite");
const migration = [
  fs.readFileSync("migrations/0001_initial_cloud_schema.sql", "utf8"),
  fs.readFileSync("migrations/0002_user_snapshots.sql", "utf8"),
].join("\n");

try {
  execFileSync("sqlite3", [database], { input: migration });
  const tables = execFileSync("sqlite3", [database, ".tables"], { encoding: "utf8" });
  ["user", "session", "account", "verification", "tasks", "events", "labels", "task_labels", "user_settings", "messages", "data_imports", "user_snapshots"]
    .forEach((table) => assert.match(tables, new RegExp(`\\b${table}\\b`)));

  execFileSync("sqlite3", [database], {
    input: [
      "INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('u1','Test','test@example.com',1,1,1);",
      "INSERT INTO tasks (id,user_id,title,due_date,created_at,updated_at) VALUES ('t1','u1','History worksheet','2026-10-19','2026-10-16T00:00:00Z','2026-10-16T00:00:00Z');",
      "INSERT INTO events (id,user_id,title,event_type,start_date,end_date,created_at,updated_at) VALUES ('e1','u1','Winter holiday','holiday','2026-12-20','2027-01-05','2026-10-16T00:00:00Z','2026-10-16T00:00:00Z');",
    ].join("\n"),
  });
  const result = execFileSync("sqlite3", [database, "SELECT COUNT(*) FROM tasks;"], { encoding: "utf8" }).trim();
  assert.equal(result, "1");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Cloudflare D1 schema and relationships passed.");
