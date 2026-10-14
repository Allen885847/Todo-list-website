(() => {
  const root = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let navigationStarted = false;

  window.runTodoViewTransition = (type, update) => {
    if (typeof update !== "function") return null;
    if (reducedMotion.matches || typeof document.startViewTransition !== "function") {
      update();
      return null;
    }
    root.dataset.uiTransition = type;
    const transition = document.startViewTransition(update);
    transition.finished.finally(() => {
      if (root.dataset.uiTransition === type) delete root.dataset.uiTransition;
    });
    return transition;
  };

  function finishPageEntry() {
    const arrivedThroughNavigation = root.classList.contains("page-transition-arriving");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove("page-transition-pending", "page-transition-leaving", "page-transition-arriving");
        if (arrivedThroughNavigation && !reducedMotion.matches) {
          root.classList.add("page-transition-revealing");
          window.setTimeout(() => root.classList.remove("page-transition-revealing"), 260);
        }
      });
    });
  }

  function rememberNavigationDirection(direction) {
    root.dataset.pageDirection = direction;
    try {
      sessionStorage.setItem("todo-page-direction", direction);
    } catch {
      // Navigation still works if session storage is unavailable.
    }
  }

  function navigateWithFallback(link, direction) {
    if (navigationStarted) return;
    navigationStarted = true;
    const destination = link.href;

    if (reducedMotion.matches) {
      window.location.assign(destination);
      return;
    }

    root.classList.add("page-transition-leaving");
    window.setTimeout(() => window.location.assign(destination), 185);
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a.calendar-link, a.back-link");
    if (!link || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target && link.target !== "_self") return;
    const direction = link.classList.contains("calendar-link") ? "forward" : "back";
    rememberNavigationDirection(direction);
    event.preventDefault();
    navigateWithFallback(link, direction);
  });

  window.addEventListener("pageshow", () => {
    navigationStarted = false;
    finishPageEntry();
  });

  finishPageEntry();
})();
