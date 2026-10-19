(() => {
  const $ = id => document.getElementById(id);
  const mode = ['register', 'reset'].includes(new URLSearchParams(location.search).get('mode')) ? new URLSearchParams(location.search).get('mode') : 'login';
  const titles = { login: 'Sign in', register: 'Create an account', reset: 'Reset password' };
  let busy = false;
  let retryUntil = 0;
  $('account-title').textContent = titles[mode];
  $('submit-account').textContent = titles[mode];
  $('account-intro').textContent = { login: 'Welcome back. Use your email and password.', register: 'Verify your email, then choose a password.', reset: 'Verify your email to choose a new password.' }[mode];
  $('verification-fields').hidden = mode === 'login';
  $('confirm-fields').hidden = mode === 'login';
  $('code').required = mode !== 'login';
  $('confirm-password').required = mode !== 'login';
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('password-label').textContent = mode === 'reset' ? 'New password' : 'Password';
  for (const link of $('account-nav').querySelectorAll('a')) {
    const target = new URL(link.href).searchParams.get('mode') || 'login';
    link.hidden = target === mode;
  }
  function status(message, error = false) {
    $('account-status').textContent = message;
    $('account-status').classList.toggle('error', error);
    if (error) $('account-status').focus();
  }
  function controls() {
    for (const button of document.querySelectorAll('button')) button.disabled = busy;
    const seconds = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000));
    $('send-code').disabled = busy || seconds > 0;
    $('send-code').textContent = seconds ? `Resend in ${seconds}s` : 'Send code';
    $('account-form').setAttribute('aria-busy', String(busy));
  }
  async function api(action, body) {
    const response = await fetch(`/api/auth/${action}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error), { retryAfter: data.retryAfter });
    return data;
  }
  async function run(work) {
    if (busy) return;
    busy = true; controls();
    try { await work(); } catch (error) {
      if (error.retryAfter) retryUntil = Date.now() + error.retryAfter * 1000;
      status(error.name === 'TimeoutError' || error instanceof TypeError ? 'Connection interrupted. Your input is preserved. Please try again.' : error.message, true);
    } finally { busy = false; controls(); }
  }
  function showUser(user) {
    $('signed-in').hidden = !user;
    $('account-form').hidden = !!user;
    $('account-nav').hidden = !!user;
    if (user) {
      $('account-title').textContent = 'Your account';
      $('account-intro').textContent = 'You are signed in on this device.';
      $('account-email').textContent = user.email;
      $('password').value = ''; $('confirm-password').value = ''; $('code').value = '';
    }
  }
  $('show-password').addEventListener('change', event => {
    for (const id of ['password', 'confirm-password']) $(id).type = event.target.checked ? 'text' : 'password';
  });
  $('confirm-password').addEventListener('input', () => $('confirm-password').setCustomValidity(''));
  $('password').addEventListener('input', () => $('confirm-password').setCustomValidity(''));
  $('send-code').addEventListener('click', () => {
    if (!$('email').reportValidity()) return;
    run(async () => {
      status('Sending verification code…');
      const result = await api('send-code', { email: $('email').value, purpose: mode });
      retryUntil = Date.now() + result.retryAfter * 1000;
      status(result.message); $('code').focus();
    });
  });
  $('account-form').addEventListener('submit', event => {
    event.preventDefault();
    if (mode !== 'login' && $('password').value !== $('confirm-password').value) {
      $('confirm-password').setCustomValidity('Passwords do not match.');
      $('confirm-password').reportValidity(); return;
    }
    run(async () => {
      status(mode === 'login' ? 'Signing in…' : 'Saving your account…');
      const result = await api(mode === 'reset' ? 'reset-password' : mode, { email: $('email').value, password: $('password').value, code: $('code').value });
      if (mode === 'login') { showUser(result.user); status('Signed in successfully.'); $('account-title').focus(); }
      else {
        $('password').value = ''; $('confirm-password').value = ''; $('code').value = '';
        $('account-form').hidden = true;
        status(result.message);
        $('sign-in-link').hidden = false;
        $('sign-in-link').focus();
      }
    });
  });
  $('logout').addEventListener('click', () => run(async () => {
    await api('logout', {});
    location.assign('/account');
  }));
  setInterval(controls, 1000);
  run(async () => {
    try { const result = await api('session'); showUser(result.user); status(''); }
    catch (error) { showUser(null); throw error; }
  });
})();
