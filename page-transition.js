(() => {
  const root = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let navigationStarted = false;

  function finishPageEntry() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove("page-transition-pending", "page-transition-leaving");
        root.dataset.pageDirection = "neutral";
      });
    });
  }

  function navigateWithTransition(link, direction) {
    if (navigationStarted) return;
    navigationStarted = true;
    const destination = link.href;
    try {
      sessionStorage.setItem("todo-page-direction", direction);
    } catch {
      // Navigation still works if session storage is unavailable.
    }

    if (reducedMotion.matches) {
      window.location.assign(destination);
      return;
    }

    root.dataset.pageDirection = direction;
    root.classList.add("page-transition-leaving");
    window.setTimeout(() => window.location.assign(destination), 190);
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a.calendar-link, a.back-link");
    if (!link || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target && link.target !== "_self") return;
    event.preventDefault();
    navigateWithTransition(link, link.classList.contains("calendar-link") ? "forward" : "back");
  });

  window.addEventListener("pageshow", () => {
    navigationStarted = false;
    finishPageEntry();
  });

  finishPageEntry();
})();
