(() => {
  const widget = document.getElementById('weather-widget');
  if (!widget) return;
  const toggle = widget.querySelector('.weather-toggle');
  const enable = widget.querySelector('.weather-enable');
  const disable = widget.querySelector('.weather-disable');
  const expansion = widget.querySelector('.weather-expansion');
  const status = widget.querySelector('.weather-status');
  const city = widget.querySelector('.weather-city');
  const temperature = widget.querySelector('.weather-current-temp');
  const currentIcon = widget.querySelector('.weather-current-icon');
  const aqiSummary = widget.querySelector('.weather-aqi-summary');
  const aqiCompact = widget.querySelector('.weather-aqi-compact');
  const aqiValue = widget.querySelector('.weather-aqi-value');
  const aqiCategory = widget.querySelector('.weather-aqi-category');
  const aqiStatus = widget.querySelector('.weather-aqi-status');
  const days = [...widget.querySelectorAll('.weather-day')];
  let enabled = false;
  let busy = false;
  let requestId = 0;
  let controller;
  let refreshTimer;
  let coordinates;
  let permission;
  const PREFERENCE_KEY = 'todo-weather-enabled-v1';
  // Open-Meteo's us_aqi uses these six US AQI category boundaries.
  const AQI_BANDS = [
    { max: 50, level: 'good', label: 'Good' },
    { max: 100, level: 'moderate', label: 'Moderate' },
    { max: 150, level: 'sensitive', label: 'Unhealthy for sensitive groups' },
    { max: 200, level: 'unhealthy', label: 'Unhealthy' },
    { max: 300, level: 'very-unhealthy', label: 'Very unhealthy' },
    { max: Infinity, level: 'hazardous', label: 'Hazardous' },
  ];
  function preference() {
    try { return localStorage.getItem(PREFERENCE_KEY); } catch { return null; }
  }
  function remember(value) {
    try { localStorage.setItem(PREFERENCE_KEY, value); } catch { /* Keep working in this visit. */ }
  }
  const iconPaths = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    cloud: '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 20 12a3 3 0 0 1-1 6Z"/>',
    rain: '<path d="M6 15a4 4 0 1 1 1-7.9A5 5 0 0 1 17 10a3 3 0 0 1 1 5M8 18l-1 3m6-3-1 3m6-3-1 3"/>',
    snow: '<path d="M6 14a4 4 0 1 1 1-7.9A5 5 0 0 1 17 9a3 3 0 0 1 1 5M7 18v3m-1.5-1.5h3M15 18v3m-1.5-1.5h3"/>',
    storm: '<path d="M6 15a4 4 0 1 1 1-7.9A5 5 0 0 1 17 10a3 3 0 0 1 1 5M13 13l-4 5h4l-2 5"/>',
    fog: '<path d="M6 12a4 4 0 1 1 1-7.9A5 5 0 0 1 17 7a3 3 0 0 1 1 5M4 16h16M6 20h12"/>',
  };
  function describe(code) {
    if (code === 0) return ['Clear', 'sun'];
    if (code === 1) return ['Mostly clear', 'sun'];
    if (code === 2) return ['Partly cloudy', 'cloud'];
    if (code === 3) return ['Overcast', 'cloud'];
    if ([45,48].includes(code)) return ['Fog', 'fog'];
    if ([51,53,55,56,57].includes(code)) return ['Drizzle', 'rain'];
    if ([61,63,65,66,67].includes(code)) return ['Rain', 'rain'];
    if ([71,73,75,77,85,86].includes(code)) return ['Snow', 'snow'];
    if ([80,81,82].includes(code)) return ['Showers', 'rain'];
    if ([95,96,99].includes(code)) return ['Thunderstorms', 'storm'];
    return ['—', null];
  }
  function setIcon(element, code) {
    const [condition, icon] = describe(code);
    element.innerHTML = icon ? `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[icon]}</svg>` : '—';
    element.setAttribute('aria-label', condition);
  }
  const numeric = value => typeof value === 'number' && Number.isFinite(value);
  const degrees = value => numeric(value) ? `${Math.round(value)}°` : '—';
  function blankAirQuality(message = 'Enable location to see air quality.') {
    widget.setAttribute('data-aqi-level', 'unknown');
    aqiCompact.textContent = '—';
    aqiValue.textContent = '—';
    aqiCategory.textContent = '—';
    aqiSummary.setAttribute('title', 'US Air Quality Index: unavailable');
    aqiStatus.textContent = message;
  }
  function showAirQuality(result) {
    const value = result.status === 'fulfilled' ? result.value?.current?.us_aqi : null;
    if (!numeric(value) || value < 0) {
      blankAirQuality('Air quality is unavailable. Retry to refresh.');
      return false;
    }
    const score = Math.round(value);
    const band = AQI_BANDS.find(entry => score <= entry.max);
    const category = band.label;
    widget.setAttribute('data-aqi-level', band.level);
    aqiCompact.textContent = String(score);
    aqiValue.textContent = String(score);
    aqiCategory.textContent = category;
    aqiSummary.setAttribute('title', `US Air Quality Index: ${score} · ${category}`);
    aqiStatus.textContent = 'US AQI · CAMS model estimate';
    return true;
  }
  function blank() {
    blankAirQuality();
    city.textContent = '—';
    temperature.textContent = '—';
    setIcon(currentIcon, null);
    toggle.setAttribute('aria-label', 'Weather: —. Expand forecast');
    days.forEach((day, index) => {
      const date = new Date();
      date.setDate(date.getDate() + index);
      day.querySelector('.weather-day-name').textContent = index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : date.toLocaleDateString('en', { weekday: 'short' });
      day.querySelector('.weather-day-condition').textContent = '—';
      day.querySelector('.weather-high').textContent = '—';
      day.querySelector('.weather-low').textContent = '—';
      day.querySelector('.weather-rain').textContent = '—';
      setIcon(day.querySelector('.weather-icon'), null);
    });
  }
  function setExpanded(expanded) {
    widget.classList.toggle('is-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    expansion.inert = !expanded;
    expansion.setAttribute('aria-hidden', String(!expanded));
  }
  toggle.addEventListener('click', () => setExpanded(toggle.getAttribute('aria-expanded') !== 'true'));
  function reset(message = 'Weather is off. Enable location to see your forecast.') {
    enabled = false;
    busy = false;
    coordinates = undefined;
    requestId++;
    controller?.abort();
    clearTimeout(refreshTimer);
    blank();
    enable.hidden = false;
    enable.disabled = false;
    enable.textContent = 'Enable location';
    enable.setAttribute('data-short-label', 'Enable');
    disable.hidden = true;
    status.textContent = message;
  }
  async function json(url, signal) {
    const response = await fetch(url, { signal, credentials: 'omit' });
    if (!response.ok) throw new Error('Weather service unavailable');
    return response.json();
  }
  async function fetchWeather(id) {
    controller?.abort();
    controller = new AbortController();
    const currentController = controller;
    const timeout = setTimeout(() => currentController.abort(), 15000);
    const { latitude, longitude } = coordinates;
    const params = new URLSearchParams({ latitude, longitude, current: 'temperature_2m,weather_code', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto', forecast_days: '4' });
    const reverse = new URLSearchParams({ lat: latitude, lon: longitude, format: 'jsonv2', zoom: '10', 'accept-language': 'en' });
    const airParams = new URLSearchParams({ latitude, longitude, current: 'us_aqi', timezone: params.get('timezone') });
    aqiStatus.textContent = 'Updating air quality…'; // Keep the last reading/color until the new result arrives.
    status.textContent = 'Fetching weather and air quality…';
    const results = await Promise.allSettled([
      json(`https://api.open-meteo.com/v1/forecast?${params}`, controller.signal),
      json(`https://nominatim.openstreetmap.org/reverse?${reverse}`, controller.signal),
      json(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`, controller.signal),
    ]);
    clearTimeout(timeout);
    if (id !== requestId || !enabled) return;
    busy = false;
    enable.disabled = false;
    enable.textContent = 'Retry';
    enable.setAttribute('data-short-label', 'Retry');
    const weather = results[0];
    if (weather.status !== 'fulfilled' || !weather.value.current || !Array.isArray(weather.value.daily?.time) || weather.value.daily.time.length < 4) {
      blank();
      const airAvailable = showAirQuality(results[2]);
      toggle.setAttribute('aria-label', `Weather unavailable. US AQI ${aqiCompact.textContent}. Toggle forecast`);
      enable.hidden = false;
      status.textContent = airAvailable ? 'Weather could not be loaded. Air quality is available; retry to refresh weather.' : 'Weather could not be loaded. Please retry.';
      return;
    }
    const address = results[1].status === 'fulfilled' ? results[1].value.address : null;
    city.textContent = address?.city || address?.town || address?.village || address?.municipality || '—';
    const { current, daily } = weather.value;
    temperature.textContent = degrees(current.temperature_2m);
    setIcon(currentIcon, current.weather_code);
    const airAvailable = showAirQuality(results[2]);
    toggle.setAttribute('aria-label', `${city.textContent}, ${temperature.textContent}, ${describe(current.weather_code)[0]}, US AQI ${aqiCompact.textContent}, ${aqiCategory.textContent}. Toggle forecast`);
    days.forEach((day, index) => {
      const date = new Date(`${daily.time[index]}T12:00:00`);
      day.querySelector('.weather-day-name').textContent = index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : date.toLocaleDateString('en', { weekday: 'short' });
      day.querySelector('.weather-day-condition').textContent = describe(daily.weather_code?.[index])[0];
      day.querySelector('.weather-high').textContent = degrees(daily.temperature_2m_max?.[index]);
      day.querySelector('.weather-low').textContent = degrees(daily.temperature_2m_min?.[index]);
      const rain = daily.precipitation_probability_max?.[index];
      day.querySelector('.weather-rain').textContent = numeric(rain) ? `${Math.round(rain)}%` : '—';
      setIcon(day.querySelector('.weather-icon'), daily.weather_code?.[index]);
    });
    enable.hidden = airAvailable;
    status.textContent = !airAvailable ? 'Weather updated. Air quality is unavailable; retry to refresh.' : city.textContent === '—' ? 'Weather and air quality updated. City name is unavailable.' : 'Updated just now · °C · US AQI';
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (enabled && !document.hidden) checkPermission(); }, 15 * 60 * 1000);
  }
  function requestLocation(automatic = false) {
    if (busy) return;
    if (!navigator.geolocation || !window.isSecureContext) {
      if (!automatic) setExpanded(true);
      status.textContent = 'Location is unavailable in this browser. Use HTTPS or localhost.';
      return;
    }
    if (automatic && (permission?.state !== 'granted' || preference() === 'disabled')) return;
    if (!automatic) setExpanded(true);
    busy = true;
    enable.disabled = true;
    status.textContent = automatic ? 'Updating your location…' : 'Waiting for location permission…';
    const id = ++requestId;
    navigator.geolocation.getCurrentPosition(async position => {
      if (id !== requestId) return;
      // The browser may revoke or expire permission while resolving location.
      if (permission?.state === 'denied' || (automatic && permission?.state !== 'granted')) {
        reset('Location access is off. Enable location to see weather.');
        return;
      }
      enabled = true;
      remember('enabled');
      // Only preference is saved. Coordinates are refreshed, never persisted.
      coordinates = { latitude: position.coords.latitude.toFixed(2), longitude: position.coords.longitude.toFixed(2) };
      disable.hidden = false;
      await fetchWeather(id);
    }, error => {
      if (id !== requestId) return;
      reset(error.code === 1 ? 'Location access was denied. Allow it in your browser, then try again.' : error.code === 3 ? 'Location request timed out. Please try again.' : 'Your device location is unavailable. Please try again.');
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 });
  }
  function permissionChanged() {
    if (permission.state !== 'granted') {
      reset('Location permission is off or has expired. Enable location to see weather.');
    } else if (preference() !== 'disabled') requestLocation(true);
  }
  async function checkPermission() {
    if (!navigator.permissions?.query) {
      if (preference() === 'enabled' && !enabled) status.textContent = 'Enable location to reconnect weather in this browser.';
      return;
    }
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      if (permission !== result) {
        permission?.removeEventListener('change', permissionChanged);
        permission = result;
        permission.addEventListener('change', permissionChanged);
      }
      if (permission.state === 'granted' && preference() !== 'disabled') requestLocation(true);
      else if (permission.state !== 'granted' && !(busy && permission.state === 'prompt')) {
        reset(preference() === 'enabled' ? 'Location permission is off or has expired. Enable location to see weather.' : 'Weather is off. Enable location to see your forecast.');
      }
    } catch {
      // No Permissions API support: a user click is required, never auto-prompt.
      if (preference() === 'enabled' && !enabled) status.textContent = 'Enable location to reconnect weather in this browser.';
    }
  }
  enable.addEventListener('click', () => requestLocation(false));
  disable.addEventListener('click', () => { remember('disabled'); reset(); });
  window.addEventListener('storage', event => {
    if (event.key !== PREFERENCE_KEY) return;
    if (event.newValue === 'disabled') reset();
    else if (event.newValue === 'enabled') checkPermission();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkPermission(); });
  window.addEventListener('pageshow', checkPermission);
  window.addEventListener('pagehide', () => { requestId++; busy = false; controller?.abort(); clearTimeout(refreshTimer); });
  blank();
  checkPermission();
})();
