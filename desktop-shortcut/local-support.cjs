const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createSupport({ dataDirectory, version, readLocalData }) {
  const settingsPath = path.join(dataDirectory, 'ai-connection.json');
  function settings() { try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return {}; } }
  function apiKey(name) { return process.env[name] || settings()[name] || ''; }
  function backup(label = 'manual') {
    const directory = path.join(dataDirectory, 'backups');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const filename = `${new Date().toISOString().replaceAll(':','-')}-${crypto.randomUUID()}.json`;
    fs.writeFileSync(path.join(directory, filename), JSON.stringify({ ...readLocalData(), format: 'ai-todo-list-backup', label }, null, 2) + '\n', { mode: 0o600 });
    return filename;
  }
  async function handle(request, response, url, readJson, sendJson) {
    if (request.method === 'GET' && url.pathname === '/api/desktop/health') {
      sendJson(response, 200, { service: 'todo-list-local-shortcut', version, loginRequired: false }); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/desktop/config') {
      sendJson(response, 200, { website: process.env.TODO_WEBSITE_ORIGIN || 'https://todolist.uno', deepseekConfigured: Boolean(apiKey('DEEPSEEK_API_KEY')), voiceConfigured: Boolean(apiKey('DOUBAO_SPEECH_API_KEY')) }); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/desktop/ai-settings') {
      try {
        const body = await readJson(request);
        const next = settings();
        for (const key of ['DEEPSEEK_API_KEY','DOUBAO_SPEECH_API_KEY']) {
          if (body[key] === undefined || body[key] === '') continue;
          if (typeof body[key] !== 'string' || body[key].length < 8 || body[key].length > 512 || /\s/.test(body[key])) throw new Error('Enter a valid API key without spaces.');
          next[key] = body[key];
        }
        if (body.removeKeys === true) { delete next.DEEPSEEK_API_KEY; delete next.DOUBAO_SPEECH_API_KEY; }
        fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
        const temporary = settingsPath + '.tmp'; fs.writeFileSync(temporary, JSON.stringify(next) + '\n', { mode: 0o600 }); fs.renameSync(temporary, settingsPath); fs.chmodSync(settingsPath, 0o600);
        sendJson(response, 200, { ok: true });
      } catch (error) { sendJson(response, 400, { error: error.message || 'AI settings could not be saved.' }); }
      return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/desktop/backup') {
      try { sendJson(response, 200, { ok: true, filename: backup('before local restore or website sync') }); }
      catch { sendJson(response, 500, { error: 'A recovery copy could not be created. Check disk space before continuing.' }); }
      return true;
    }
    return false;
  }
  return { apiKey, handle, backup };
}
module.exports = { createSupport };
