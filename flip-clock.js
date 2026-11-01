// Local date getters deliberately follow the user's device timezone.
(function (root) {
  function localTimeParts(date = new Date()) {
    const hours = date.getHours();
    return {
      parts: [hours % 12 || 12, date.getMinutes(), date.getSeconds()].map(number => String(number).padStart(2, '0')),
      meridiem: hours >= 12 ? 'PM' : 'AM',
    };
  }
  const api = { localTimeParts };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TodoFlipClock = api;
})(globalThis);

(() => {
  if (typeof document === 'undefined') return;
  const clock = document.getElementById('flip-clock');
  if (!clock) return;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const digits = [];
  for (let group = 0; group < 3; group++) {
    if (group) {
      const colon = document.createElement('span');
      colon.className = 'flip-clock-colon';
      colon.textContent = ':';
      colon.setAttribute('aria-hidden', 'true');
      clock.append(colon);
    }
    const pair = document.createElement('div');
    pair.className = 'flip-clock-pair';
    pair.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 2; i++) {
      const digit = document.createElement('span');
      digit.className = 'flip-digit';
      digit.innerHTML = '<span class="flip-half flip-top"><span></span></span><span class="flip-half flip-bottom"><span></span></span>';
      pair.append(digit);
      digits.push({ element: digit, value: null });
    }
    clock.append(pair);
  }
  const period = document.createElement('span');
  period.className = 'flip-clock-period';
  period.setAttribute('aria-hidden', 'true');
  clock.append(period);
  function setDigit(digit, value, animate) {
    if (digit.value === value) return;
    digit.element.querySelectorAll('.flip-leaf').forEach(leaf => leaf.remove());
    const previous = digit.value;
    digit.value = value;
    digit.element.querySelectorAll('.flip-half > span').forEach(half => { half.textContent = value; });
    if (!animate || previous === null || reduceMotion.matches) return;
    const lowerFace = digit.element.querySelector('.flip-bottom > span');
    lowerFace.textContent = previous;
    const top = document.createElement('span');
    top.className = 'flip-half flip-top flip-leaf flip-leaf-out';
    const bottom = document.createElement('span');
    bottom.className = 'flip-half flip-bottom flip-leaf flip-leaf-in';
    const oldNumber = document.createElement('span');
    oldNumber.textContent = previous;
    const newNumber = document.createElement('span');
    newNumber.textContent = value;
    top.append(oldNumber);
    bottom.append(newNumber);
    digit.element.append(top, bottom);
    bottom.addEventListener('animationend', () => {
      if (digit.value === value) lowerFace.textContent = value;
      top.remove();
      bottom.remove();
    }, { once: true });
  }
  let timer;
  function tick(animate = true) {
    clearTimeout(timer);
    const now = new Date();
    const { parts, meridiem } = TodoFlipClock.localTimeParts(now);
    period.textContent = meridiem;
    parts.join('').split('').forEach((value, index) => setDigit(digits[index], value, animate));
    clock.setAttribute('aria-label', `Local time ${parts.join(':')} ${meridiem}`);
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 8);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else tick(false);
  });
  window.addEventListener('pageshow', () => tick(false));
  window.addEventListener('pagehide', () => clearTimeout(timer));
  tick(false);
})();

// Keep the editable display title tall enough for descenders and wrapped names.
(() => {
  if (typeof document === 'undefined') return;
  const title = document.getElementById('list-title');
  if (!title) return;
  const fit = () => {
    title.style.height = 'auto';
    title.style.height = `${title.scrollHeight + 2}px`;
  };
  title.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); title.blur(); }
  });
  title.addEventListener('input', fit);
  title.addEventListener('blur', fit);
  window.addEventListener('resize', fit);
  window.addEventListener('storage', () => requestAnimationFrame(fit));
  document.fonts?.ready.then(fit);
  fit();
})();
