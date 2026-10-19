const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../../server');
let server, dir;
let clock = Date.now();
const messages = [];
test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-ui-'));
  server = createServer({ now: () => clock, env: { APP_ORIGIN: 'http://127.0.0.1:4199', AUTH_DB_PATH: path.join(dir, 'auth.sqlite'), AUTH_SECRET: 'ui-test-secret-'.repeat(4) }, sendMail: async mail => messages.push(mail) });
  await new Promise(resolve => server.listen(4199, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('register, reject mismatch, sign in, persist session, sign out and reset via mock mail', async ({ page }) => {
  await page.goto('/account?mode=register');
  await expect(page.locator('#account-form')).toBeVisible();
  await page.getByLabel('Email address').fill('ui@example.test');
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('If this address is eligible');
  await expect(page.locator('#send-code')).toBeDisabled();
  await page.getByLabel('Email verification code').fill(messages.at(-1).text.match(/\b\d{6}\b/)[0]);
  await page.getByLabel('Password', { exact: true }).fill('a durable test password');
  await page.getByLabel('Confirm password').fill('different password');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await expect(page.locator('#confirm-password')).toHaveJSProperty('validationMessage', 'Passwords do not match.');
  await page.getByLabel('Confirm password').fill('a durable test password');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Account created');
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await page.getByLabel('Email address').fill('ui@example.test');
  await page.getByLabel('Password', { exact: true }).fill('a durable test password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signed-in')).toBeVisible();
  await page.reload();
  await expect(page.locator('#account-email')).toHaveText('ui@example.test');
  await expect.poll(async () => (await page.context().cookies()).find(c => c.name === 'todo_session')?.httpOnly).toBe(true);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('#account-form')).toBeVisible();
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email address').fill('ui@example.test');
  // Cooldown enforcement is tested against the real server; avoid waiting a minute here.
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Too many attempts');
  await expect(page.locator('#send-code')).toBeDisabled();
  clock += 61000;
  await page.reload();
  await page.getByLabel('Email address').fill('ui@example.test');
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('If this address is eligible');
  await page.getByLabel('Email verification code').fill(messages.at(-1).text.match(/\b\d{6}\b/)[0]);
  await page.getByLabel('New password', { exact: true }).fill('a new durable password');
  await page.getByLabel('Confirm password').fill('a new durable password');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Password updated');
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await page.getByLabel('Email address').fill('ui@example.test');
  await page.getByLabel('Password', { exact: true }).fill('a new durable password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signed-in')).toBeVisible();
});

test('desktop and mobile screenshots; form errors and layout', async ({ page }) => {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    for (const mode of ['login', 'register', 'reset']) {
      await page.goto(`/account?mode=${mode}`);
      await expect(page.locator('#account-form')).toBeVisible();
      await page.screenshot({ path: `test-results/${name}-${mode}.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.goto('/account');
  await page.getByLabel('Email address').fill('missing@example.test');
  await page.getByLabel('Password', { exact: true }).fill('a nonexistent password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Email or password is incorrect');
  await expect(page.getByLabel('Email address')).toHaveValue('missing@example.test');
  await expect(page.getByRole('status')).toBeFocused();
  await page.route('**/api/auth/login', route => route.abort());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Connection interrupted');
  await page.screenshot({ path: 'test-results/mobile-error.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Account / Sign in' })).toBeVisible();
  await expect(page.locator('#task-form')).toBeVisible();
});
