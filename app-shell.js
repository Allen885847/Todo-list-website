(() => {
  const stage = document.querySelector("#app-stage");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const systemTheme = matchMedia("(prefers-color-scheme: dark)");
  const routes = {
    todo: { src: "index.html?embedded=1", title: "Todo List" },
    calendar: { src: "calendar.html?embedded=1", title: "Calendar · Todo List" },
    data: { src: "data.html?embedded=1", title: "Data · Todo List" },
  };
  let currentFrame = null;
  let currentRoute = null;
  let transitionRunning = false;
  let queuedRoute = null;
  const frames = new Map();
  const frameReadiness = new Map();

  function normalizeRoute(value) {
    return Object.hasOwn(routes, value) ? value : "todo";
  }

  function routeFromLocation() {
    return normalizeRoute(location.hash.slice(1));
  }

  function syncShellTheme() {
    let saved = "system";
    try { saved = localStorage.getItem("todo-appearance") || "system"; } catch { /* Use system. */ }
    const mode = ["light", "dark", "system"].includes(saved) ? saved : "system";
    document.documentElement.dataset.appearance = mode;
    document.documentElement.dataset.theme = mode === "system"
      ? (systemTheme.matches ? "dark" : "light")
      : mode;
  }

  function broadcastAppearance(mode) {
    frames.forEach((frame) => {
      frame.contentWindow?.postMessage({ type: "todo-appearance-sync", mode }, location.origin);
    });
  }

  function createFrame(route) {
    const frame = document.createElement("iframe");
    frame.className = "app-view";
    frame.title = routes[route].title;
    frame.allow = "microphone";
    frame.src = routes[route].src;
    frame.dataset.route = route;
    frame.inert = true;
    return frame;
  }

  function prepareFrame(route) {
    const preparedRoute = normalizeRoute(route);
    if (frameReadiness.has(preparedRoute)) return frameReadiness.get(preparedRoute);

    const frame = createFrame(preparedRoute);
    const frameLoaded = waitForLoad(frame);
    const storageReady = waitForStorageReady(frame);
    frames.set(preparedRoute, frame);
    stage.append(frame);

    const readiness = Promise.all([frameLoaded, storageReady])
      .then(() => {
        connectFrame(frame);
        frame.dataset.ready = "true";
        return frame;
      })
      .catch((error) => {
        frames.delete(preparedRoute);
        frameReadiness.delete(preparedRoute);
        frame.remove();
        throw error;
      });
    frameReadiness.set(preparedRoute, readiness);
    return readiness;
  }

  function preloadPrimaryViews() {
    const preload = () => {
      ["todo", "calendar"].forEach((route) => {
        if (route !== currentRoute) prepareFrame(route).catch(() => {});
      });
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(preload, { timeout: 900 });
    else window.setTimeout(preload, 80);
  }

  function waitForLoad(frame) {
    return new Promise((resolve, reject) => {
      frame.addEventListener("load", resolve, { once: true });
      frame.addEventListener("error", reject, { once: true });
    });
  }

  function waitForStorageReady(frame) {
    return new Promise((resolve) => {
      let timer;
      const finish = () => {
        window.removeEventListener("message", handleMessage);
        window.clearTimeout(timer);
        resolve();
      };
      const handleMessage = (event) => {
        if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
        if (event.data?.type === "todo-storage-ready") finish();
      };
      window.addEventListener("message", handleMessage);
      timer = window.setTimeout(finish, 5000);
    });
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function routeForLink(link) {
    if (link.matches(".calendar-link")) return "calendar";
    if (link.matches(".back-link, .data-back")) return "todo";
    if (link.matches(".data-link")) return "data";
    return null;
  }

  function connectFrame(frame) {
    const frameDocument = frame.contentDocument;
    if (!frameDocument) return;

    frameDocument.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest("a");
      if (!link) return;
      const route = routeForLink(link);
      if (!route) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(route, { updateHistory: true });
    }, true);

    const frameRoot = frameDocument.documentElement;
    const themeObserver = new MutationObserver(syncShellTheme);
    themeObserver.observe(frameRoot, { attributes: true, attributeFilter: ["data-theme", "data-appearance"] });
    frame.addEventListener("load", () => themeObserver.disconnect(), { once: true });
  }

  async function revealFrame(nextFrame, direction) {
    const previousFrame = currentFrame;
    if (previousFrame) {
      previousFrame.classList.remove("is-current");
      previousFrame.classList.add("is-leaving");
      previousFrame.inert = true;
    }
    nextFrame.inert = false;
    nextFrame.classList.add("is-entering");
    await waitForPaint();

    if (!previousFrame || reducedMotion.matches) {
      previousFrame?.classList.remove("is-leaving");
      nextFrame.classList.remove("is-entering");
      nextFrame.classList.add("is-current");
      return;
    }

    const entersFromRight = direction !== "back";
    const enterOffset = entersFromRight ? "100%" : "-100%";
    const leaveOffset = entersFromRight ? "-6%" : "6%";
    const timing = { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" };

    const incoming = nextFrame.animate([
      { transform: `translate3d(${enterOffset}, 0, 0)` },
      { transform: "translate3d(0, 0, 0)" },
    ], timing);
    const outgoing = previousFrame.animate([
      { transform: "translate3d(0, 0, 0) scale(1)" },
      { transform: `translate3d(${leaveOffset}, 0, 0) scale(0.995)` },
    ], timing);

    await Promise.allSettled([incoming.finished, outgoing.finished]);
    previousFrame.getAnimations().forEach((animation) => animation.cancel());
    previousFrame.classList.remove("is-leaving");
    nextFrame.getAnimations().forEach((animation) => animation.cancel());
    nextFrame.classList.remove("is-entering");
    nextFrame.classList.add("is-current");
  }

  async function navigate(route, { updateHistory = false } = {}) {
    const nextRoute = normalizeRoute(route);
    if (nextRoute === currentRoute && currentFrame) return;
    if (transitionRunning) {
      queuedRoute = nextRoute;
      return;
    }

    transitionRunning = true;
    const previousRoute = currentRoute;
    const direction = nextRoute === "todo" && previousRoute !== "todo" ? "back" : "forward";
    if (updateHistory) history.pushState({ route: nextRoute }, "", `#${nextRoute}`);

    try {
      const nextFrame = await prepareFrame(nextRoute);
      await revealFrame(nextFrame, direction);
      currentFrame = nextFrame;
      currentRoute = nextRoute;
      document.title = routes[nextRoute].title;
      stage.classList.add("is-ready");
      syncShellTheme();
      nextFrame.contentWindow?.postMessage({ type: "todo-view-activated", route: nextRoute }, location.origin);
      preloadPrimaryViews();
    } catch {
      // Keep the current view available if a destination cannot be prepared.
    } finally {
      transitionRunning = false;
      if (queuedRoute && queuedRoute !== currentRoute) {
        const pendingRoute = queuedRoute;
        queuedRoute = null;
        navigate(pendingRoute);
      } else {
        queuedRoute = null;
      }
    }
  }

  window.addEventListener("popstate", () => navigate(routeFromLocation()));
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.data?.type !== "todo-appearance-change") return;
    const mode = event.data.mode;
    if (!["light", "dark", "system"].includes(mode)) return;
    try { localStorage.setItem("todo-appearance", mode); } catch { /* Keep in-memory appearance. */ }
    syncShellTheme();
    broadcastAppearance(mode);
  });
  systemTheme.addEventListener("change", () => {
    syncShellTheme();
    const mode = document.documentElement.dataset.appearance || "system";
    if (mode === "system") broadcastAppearance(mode);
  });
  window.todoShellNavigate = (route) => navigate(route, { updateHistory: true });
  syncShellTheme();
  navigate(routeFromLocation());
})();
