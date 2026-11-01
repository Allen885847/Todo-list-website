import assert from 'node:assert/strict';
import { handleDataRequest } from './src/cloudflare-data.mjs';
const records = new Map(), backups = new Map();
const env = {
  DB: { prepare: sql => ({ bind: (...values) => ({
    first: async () => records.get(values[0]) || null,
    run: async () => records.set(values[0], { schema_version: values[1], data_json: values[2], updated_at: values[3] }),
  }) }) },
  BUCKET: { put: async (key, data) => backups.set(key, data), get: async key => backups.has(key) ? { json: async () => JSON.parse(backups.get(key)) } : null },
};
const data = {
  'todo-list-mvp': JSON.stringify({ title: 'Private title', tasks: [{ id: 'a', task: 'Test', label: 'Extra', completed: true }] }),
  'todo-calendar-events': JSON.stringify([{ id: 'e', title: 'Holiday', holiday: true, startDate: '2026-12-31', endDate: '2027-01-14' }]),
  'todo-task-timers-v1': JSON.stringify({ owner: 'account-a', timers: {} }),
  'todo-appearance': 'dark',
};
const put = new Request('https://test.invalid/api/storage', { method: 'PUT', body: JSON.stringify({ schemaVersion: 1, data: { ...data, credential: 'never-save' } }) });
assert.equal((await handleDataRequest(put, env, 'account-a')).status, 200);
const get = () => new Request('https://test.invalid/api/storage');
const restored = await (await handleDataRequest(get(), env, 'account-a')).json();
assert.deepEqual(restored.data, data);
assert.equal((await (await handleDataRequest(get(), env, 'account-b')).json()).exists, false);
records.clear();
const recovered = await (await handleDataRequest(get(), env, 'account-a')).json();
assert.equal(recovered.recoveredFromBackup, true);
assert.deepEqual(recovered.data, data);
console.log('Account snapshots passed: task/event/holiday/settings/timer round trip, private per-account storage, allowlist, and R2 recovery.');
