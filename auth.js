const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomInt, createHash, createHmac, scryptSync, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');

const hash = value => createHash('sha256').update(value).digest('hex');
function createAuth({ env = process.env, now = Date.now, sendMail } = {}) {
  const filename = env.AUTH_DB_PATH || path.join(__dirname, 'data', 'auth.sqlite');
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS codes (email TEXT, purpose TEXT, digest TEXT, expires INTEGER, attempts INTEGER DEFAULT 0, PRIMARY KEY(email,purpose));
    CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, email TEXT, expires INTEGER);
    CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER, expires INTEGER);`);
  const origin = new URL(env.APP_ORIGIN || 'http://127.0.0.1:4173').origin;
  const secure = origin.startsWith('https:');
  if (env.NODE_ENV === 'production' && !secure) throw new Error('Production APP_ORIGIN must use HTTPS.');
  const secret = env.AUTH_SECRET;
  const configured = typeof secret === 'string' && secret.length >= 32;
  const mailConfigured = configured && env.SMTP_USER && env.SMTP_PASS;
  const smtp = mailConfigured ? nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.163.com', port: Number(env.SMTP_PORT || 465), secure: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  }) : null;
  const transport = sendMail || (smtp && (message => smtp.sendMail(message)));
  const fail = (status, message, retryAfter) => { throw Object.assign(new Error(message), { status, retryAfter }); };
  const codeHash = (email, purpose, code) => createHmac('sha256', secret).update(`${email}|${purpose}|${code}`).digest('hex');
  function rate(key, max, window) {
    const row = db.prepare('SELECT * FROM limits WHERE key=?').get(key);
    if (row && row.expires > now() && row.count >= max) fail(429, 'Too many attempts. Please try again later.', Math.ceil((row.expires - now()) / 1000));
    db.prepare('INSERT OR REPLACE INTO limits VALUES (?,?,?)').run(key, row && row.expires > now() ? row.count + 1 : 1, row && row.expires > now() ? row.expires : now() + window);
  }
  function passwordHash(password) {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  }
  const dummy = passwordHash(randomBytes(32).toString('hex'));
  function passwordMatches(password, stored) {
    const [salt, digest] = stored.split(':');
    return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex'));
  }
  function cookie(response, token, maxAge) {
    response.setHeader('Set-Cookie', `todo_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
  }
  function session(request) {
    const token = /(?:^|;\s*)todo_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie || '')?.[1];
    return token ? db.prepare('SELECT * FROM sessions WHERE digest=? AND expires>?').get(hash(token), now()) : null;
  }
  function verifyCode(email, purpose, code) {
    const row = db.prepare('SELECT * FROM codes WHERE email=? AND purpose=?').get(email, purpose);
    if (!row || row.expires <= now() || row.attempts >= 5) fail(400, 'Code is invalid or expired. Request a new code.');
    db.prepare('UPDATE codes SET attempts=attempts+1 WHERE email=? AND purpose=?').run(email, purpose);
    if (typeof code !== 'string' || !/^\d{6}$/.test(code) || row.digest !== codeHash(email, purpose, code)) fail(400, 'Code is invalid or expired. Request a new code.');
  }
  async function handle(request, response, url, readJson, sendJson) {
    if (!url.pathname.startsWith('/api/auth/')) return false;
    try {
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(now());
      db.prepare('DELETE FROM codes WHERE expires<=?').run(now());
      db.prepare('DELETE FROM limits WHERE expires<=?').run(now());
      const action = url.pathname.slice('/api/auth/'.length);
      if (request.method === 'GET' && action === 'session') {
        const current = session(request);
        sendJson(response, 200, { user: current ? { email: current.email } : null });
        return true;
      }
      if (request.method !== 'POST') fail(405, 'Method not allowed.');
      if (request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Refresh this page at the configured site address and try again.');
      if (!(request.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Send JSON data.');
      if (action === 'logout') {
        const current = session(request);
        if (current) db.prepare('DELETE FROM sessions WHERE digest=?').run(current.digest);
        cookie(response, '', 0);
        sendJson(response, 200, { message: 'Signed out.' });
        return true;
      }
      if (!['send-code', 'register', 'reset-password', 'login'].includes(action)) fail(404, 'Not found.');
      const ip = request.socket.remoteAddress || 'unknown';
      rate(`requests:${ip}`, 60, 15 * 60000);
      const body = await readJson(request).catch(() => fail(400, 'Request must contain valid JSON.'));
      if (!body || typeof body !== 'object') fail(400, 'Enter your account details.');
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
      if (action === 'send-code') {
        if (!['register', 'reset'].includes(body.purpose)) fail(400, 'Invalid verification purpose.');
        if (!configured || (!sendMail && !mailConfigured)) fail(503, 'Email verification is not configured. Contact the site owner.');
        rate(`mail-ip:${ip}`, 10, 3600000);
        rate(`mail-hour:${email}`, 5, 3600000);
        rate(`mail-minute:${email}`, 1, 60000);
        const exists = db.prepare('SELECT email FROM users WHERE email=?').get(email);
        const eligible = body.purpose === 'register' ? !exists : !!exists;
        if (eligible) {
          const code = String(randomInt(100000, 1000000));
          const digest = codeHash(email, body.purpose, code);
          db.prepare('INSERT OR REPLACE INTO codes VALUES (?,?,?,?,0)').run(email, body.purpose, digest, now() + 600000);
          try {
            await transport({ from: env.SMTP_USER, to: email, subject: `Todo List — ${body.purpose === 'register' ? 'verify your email' : 'reset your password'}`,
              text: `Your verification code is ${code}. It expires in 10 minutes and can be used once. If you did not request this, ignore this email.` });
          } catch {
            db.prepare('DELETE FROM codes WHERE email=? AND purpose=? AND digest=?').run(email, body.purpose, digest);
            fail(503, 'Email could not be sent. Wait one minute and try again, or contact the site owner.');
          }
        }
        sendJson(response, 200, { message: 'If this address is eligible, a code has been sent. Check your inbox and spam folder.', retryAfter: 60 });
        return true;
      }
      const password = body.password;
      if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail(400, 'Use a password with 12–128 characters.');
      rate(`attempt:${ip}:${email}`, 10, 15 * 60000);
      rate(`account-attempt:${email}`, 30, 15 * 60000);
      if (action === 'login') {
        const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        if (!passwordMatches(password, user?.password || dummy) || !user) fail(401, 'Email or password is incorrect.');
        const previous = session(request);
        if (previous) db.prepare('DELETE FROM sessions WHERE digest=?').run(previous.digest);
        const token = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), email, now() + 7 * 86400000);
        cookie(response, token, 7 * 86400);
        sendJson(response, 200, { user: { email } });
        return true;
      }
      if (!configured) fail(503, 'Email verification is not configured. Contact the site owner.');
      const purpose = action === 'register' ? 'register' : 'reset';
      verifyCode(email, purpose, body.code);
      const stored = passwordHash(password);
      db.exec('BEGIN IMMEDIATE');
      try {
        if (action === 'register') db.prepare('INSERT INTO users VALUES (?,?)').run(email, stored);
        else {
          const result = db.prepare('UPDATE users SET password=? WHERE email=?').run(stored, email);
          if (!result.changes) throw new Error('Account unavailable');
          db.prepare('DELETE FROM sessions WHERE email=?').run(email);
        }
        db.prepare('DELETE FROM codes WHERE email=? AND purpose=?').run(email, purpose);
        db.exec('COMMIT');
      } catch {
        db.exec('ROLLBACK');
        fail(400, 'Unable to update this account. Request a new code or sign in.');
      }
      if (action === 'reset-password') cookie(response, '', 0);
      sendJson(response, 200, { message: action === 'register' ? 'Account created. Sign in with your password.' : 'Password updated. Sign in again.' });
    } catch (error) {
      if (error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
      sendJson(response, error.status || 500, { error: error.status ? error.message : 'Account service is unavailable. Please try again.', retryAfter: error.retryAfter });
    }
    return true;
  }
  return { handle, close: () => db.close() };
}
module.exports = { createAuth };
