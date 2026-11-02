(() => {
  const mobile = Boolean(navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  document.documentElement.classList.toggle('is-mobile-device', mobile);
  document.querySelectorAll('[data-desktop-only]').forEach(element => { element.hidden = mobile; });
})();
