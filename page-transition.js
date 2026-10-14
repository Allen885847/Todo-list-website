(() => {
  const root = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let navigationStarted = false;
  let revealTimer = 0;
  let restoreAnimation = null;
  let entryHandled = false;
  let entryFrame = 0;
  let entryFrameAfterPaint = 0;

  function cancelScheduledEntry() {
    window.cancelAnimationFrame(entryFrame);
    window.cancelAnimationFrame(entryFrameAfterPaint);
    entryFrame = 0;
    entryFrameAfterPaint = 0;
  }

  function clearTransitionState() {
    cancelScheduledEntry();
    window.clearTimeout(revealTimer);
    revealTimer = 0;
    root.classList.remove(
      "page-transition-pending",
      "page-transition-leaving",
      "page-transition-arriving",
      "page-transition-revealing",
    );
  }

  function consumeNavigationDirection() {
    let direction = root.dataset.pageDirection || "neutral";
    try {
      direction = sessionStorage.getItem("todo-page-direction") || direction;
      sessionStorage.removeItem("todo-page-direction");
    } catch {
      // Keep the direction already stored on the document.
    }
    root.dataset.pageDirection = direction;
    return direction;
  }

  function animateRestoredPage(direction) {
    if (reducedMotion.matches) return;
    const shell = document.querySelector(".app-shell, .calendar-shell");
    if (!shell || typeof shell.animate !== "function") return;
    restoreAnimation?.cancel();
    const offset = direction === "back" ? -10 : 10;
    restoreAnimation = shell.animate(
      [
        { opacity: 0.9, transform: `translate3d(${offset}px, 0, 0) scale(0.998)` },
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
      ],
      { duration: 145, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }

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
    if (entryHandled) return;
    entryHandled = true;
    const arrivedThroughNavigation = root.classList.contains("page-transition-arriving");
    entryFrame = requestAnimationFrame(() => {
      entryFrame = 0;
      entryFrameAfterPaint = requestAnimationFrame(() => {
        entryFrameAfterPaint = 0;
        clearTransitionState();
        if (arrivedThroughNavigation && !reducedMotion.matches) {
          root.classList.add("page-transition-revealing");
          revealTimer = window.setTimeout(() => {
            root.classList.remove("page-transition-revealing");
            revealTimer = 0;
          }, 210);
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
    window.setTimeout(() => window.location.assign(destination), 140);
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

  window.addEventListener("pagehide", () => {
    // A page can be restored from the back-forward cache. Never store the
    // full-screen transition cover in that snapshot.
    clearTransitionState();
    restoreAnimation?.cancel();
    restoreAnimation = null;
    navigationStarted = false;
    entryHandled = false;
  });

  window.addEventListener("pageshow", (event) => {
    navigationStarted = false;
    if (event.persisted) {
      const direction = consumeNavigationDirection();
      clearTransitionState();
      animateRestoredPage(direction);
      return;
    }
    finishPageEntry();
  });

  finishPageEntry();
})();
