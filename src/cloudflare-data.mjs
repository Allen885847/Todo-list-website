import BackupMerge from "../backup-merge.js";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

const SNAPSHOT_KEYS = new Set([
  "todo-list-mvp",
  "todo-calendar-events",
  "todo-calendar-events-v2.5",
  "todo-calendar-events-v2.4",
  "todo-appearance",
  "todo-calendar-view",
  "todo-calendar-view-v2.5",
  "todo-task-timers-v1",
  "todo-data-schema",
  "todo-data-backup-before-v2.5",
]);

async function readJson(request, maximumBytes = 1_500_000) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maximumBytes) throw new Error("PAYLOAD_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error("PAYLOAD_TOO_LARGE");
  return text ? JSON.parse(text) : {};
}

function cleanSnapshotData(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_DATA");
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SNAPSHOT_KEYS.has(key)) continue;
    if (value !== null && typeof value !== "string") throw new Error("INVALID_DATA");
    output[key] = value;
  }
  return output;
}

async function getSnapshot(env, userId) {
  const record = await env.DB.prepare(
    "SELECT schema_version, data_json, updated_at FROM user_snapshots WHERE user_id = ?",
  ).bind(userId).first();
  if (!record) {
    try {
      const backup = await env.BUCKET.get(`accounts/${userId}/latest.json`);
      if (backup) {
        const stored = await backup.json();
        return {
          exists: true,
          recoveredFromBackup: true,
          schemaVersion: Number(stored.schemaVersion) || 1,
          data: cleanSnapshotData(stored.data),
          updatedAt: stored.updatedAt || null,
        };
      }
    } catch { /* A missing or unreadable backup means this is a new account. */ }
    return { exists: false, schemaVersion: 1, data: {}, updatedAt: null };
  }
  let data = {};
  try { data = cleanSnapshotData(JSON.parse(record.data_json)); } catch { data = {}; }
  return { exists: true, schemaVersion: record.schema_version, data, updatedAt: record.updated_at };
}

async function revision(data) {
  const bytes = new TextEncoder().encode(BackupMerge.canonical(data));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function mergeDesktopSnapshot(request, env, userId) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Open this import on the Todo List website." }, 403);
  try {
    const body = await readJson(request);
    if (body.accountId !== userId) return json({ error: "The signed-in account changed. Start the import again and confirm the correct account.", code: "ACCOUNT_CHANGED" }, 409);
    if (body.confirmed !== true) return json({ error: "Confirm the merge before uploading desktop data." }, 400);
    const current = await getSnapshot(env, userId);
    if (typeof body.revision !== "string" || body.revision !== await revision(current.data)) {
      return json({ error: "Your Online data changed. Review the updated merge before saving.", code: "MERGE_CHANGED" }, 409);
    }
    const result = BackupMerge.preview(current.data, body.data, { choices: body.choices, owner: userId });
    if (!result.canSave) return json({ error: "Choose which version to keep for each difference.", code: "MERGE_REVIEW_REQUIRED" }, 422);
    const updatedAt = new Date().toISOString();
    // Keep the complete previous snapshot before any mutation, including conflicting versions.
    await env.BUCKET.put(`accounts/${userId}/import-backups/${updatedAt}-${crypto.randomUUID()}.json`, JSON.stringify(current), {
      httpMetadata: { contentType: "application/json" }, customMetadata: { owner: userId, purpose: "before-desktop-merge" },
    });
    const previous = current.exists && !current.recoveredFromBackup ? JSON.stringify(current.data) : null;
    const saved = await env.DB.prepare(`
      INSERT INTO user_snapshots (user_id, schema_version, data_json, updated_at) VALUES (?, 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
      WHERE user_snapshots.data_json = ?
    `).bind(userId, JSON.stringify(result.data), updatedAt, previous).run();
    if (saved.meta?.changes !== 1) return json({ error: "Your Online data changed. Review the updated merge before saving.", code: "MERGE_CHANGED" }, 409);
    let backupWarning = false;
    try {
      await env.BUCKET.put(`accounts/${userId}/latest.json`, JSON.stringify({ schemaVersion: 1, data: result.data, updatedAt }), {
        httpMetadata: { contentType: "application/json" }, customMetadata: { owner: userId, purpose: "account-recovery" },
      });
    } catch { backupWarning = true; }
    return json({ ok: true, data: result.data, counts: result.counts, revision: await revision(result.data), backupWarning });
  } catch (error) {
    return json({ error: error.message === "PAYLOAD_TOO_LARGE" ? "This backup is too large." : "The merge could not be saved. Your local copy is unchanged. Check the backup and try again." }, 400);
  }
}

async function putSnapshot(request, env, userId) {
  const body = await readJson(request);
  const data = cleanSnapshotData(body.data);
  const schemaVersion = Number.isInteger(body.schemaVersion) && body.schemaVersion > 0
    ? Math.min(body.schemaVersion, 1000)
    : 1;
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO user_snapshots (user_id, schema_version, data_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      schema_version = excluded.schema_version,
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
  `).bind(userId, schemaVersion, JSON.stringify(data), updatedAt).run();
  await env.BUCKET.put(`accounts/${userId}/latest.json`, JSON.stringify({
    schemaVersion,
    data,
    updatedAt,
  }), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { owner: userId, purpose: "account-recovery" },
  });
  return json({ ok: true, schemaVersion, updatedAt });
}

export async function bootstrapUserData(env, userId) {
  const results = await env.DB.batch([
    env.DB.prepare("SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY due_date IS NULL, due_date, sort_order, created_at").bind(userId),
    env.DB.prepare("SELECT * FROM events WHERE user_id = ? AND deleted_at IS NULL ORDER BY start_date, start_time IS NULL, start_time, created_at").bind(userId),
    env.DB.prepare("SELECT * FROM labels WHERE user_id = ? ORDER BY normalized_name").bind(userId),
    env.DB.prepare("SELECT task_id, label_id FROM task_labels WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ? AND deleted_at IS NULL)").bind(userId),
    env.DB.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(userId),
  ]);

  return {
    tasks: rows(results[0]),
    events: rows(results[1]),
    labels: rows(results[2]),
    taskLabels: rows(results[3]),
    settings: rows(results[4])[0] || null,
  };
}

export async function handleDataRequest(request, env, userId) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    return json(await bootstrapUserData(env, userId));
  }
  if (url.pathname === "/api/storage" && request.method === "GET") {
    const snapshot = await getSnapshot(env, userId);
    return json({ ...snapshot, revision: await revision(snapshot.data) });
  }
  if (url.pathname === "/api/storage" && request.method === "PUT") {
    try {
      return await putSnapshot(request, env, userId);
    } catch (error) {
      if (error?.message === "PAYLOAD_TOO_LARGE") {
        return json({ error: "The saved data is too large.", code: "PAYLOAD_TOO_LARGE" }, 413);
      }
      return json({ error: "The saved data is invalid.", code: "INVALID_DATA" }, 400);
    }
  }
  if (url.pathname === "/api/desktop/merge" && request.method === "POST") return mergeDesktopSnapshot(request, env, userId);
  return json({ error: "The cloud data route is not available yet.", code: "ROUTE_NOT_FOUND" }, 404);
}
