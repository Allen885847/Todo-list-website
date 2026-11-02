(function (root) {
  'use strict';
  const TASKS = 'todo-list-mvp';
  const EVENTS = 'todo-calendar-events';
  const EVENT_KEYS = [EVENTS, 'todo-calendar-events-v2.5', 'todo-calendar-events-v2.4'];
  const SETTINGS = ['todo-appearance', 'todo-calendar-view', 'todo-calendar-view-v2.5'];
  const KEYS = [TASKS, ...EVENT_KEYS, ...SETTINGS, 'todo-task-timers-v1', 'todo-data-schema', 'todo-data-backup-before-v2.5'];
  const canonical = value => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  };
  function parse(value, fallback, name) {
    if (value == null || value === '') return fallback;
    try { return JSON.parse(value); } catch { throw new Error(`${name} contains invalid JSON. Select a valid Todo List backup.`); }
  }
  function hash(text) {
    let result = 14695981039346656037n;
    for (const char of text) result = BigInt.asUintN(64, (result ^ BigInt(char.codePointAt(0))) * 1099511628211n);
    return result.toString(16);
  }
  const normalized = text => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
  function fingerprint(item, kind) {
    return kind === 'task'
      ? canonical([normalized(item.task ?? item.text), normalized(item.subject || 'General'), item.date || null])
      : canonical([normalized(item.title), item.startDate || '', item.endDate || '', item.startTime || '', item.endTime || '', Boolean(item.holiday), Boolean(item.allDay)]);
  }
  function cleanData(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Select a valid Todo List backup.');
    const result = {};
    for (const key of KEYS) {
      const value = input[key];
      if (value === undefined) continue;
      if (value !== null && typeof value !== 'string') throw new Error('Backup storage values must be text or null.');
      result[key] = value;
    }
    if (JSON.stringify(result).length > 1_400_000) throw new Error('This backup is too large. Use a backup smaller than 1.4 MB.');
    return result;
  }
  function readBackup(payload) {
    if (!payload || (payload.format && payload.format !== 'ai-todo-list-backup') || !payload.data || !Number.isInteger(payload.schemaVersion) || payload.schemaVersion < 1 || payload.schemaVersion > 1) {
      throw new Error('This is not a supported Todo List backup. Choose a JSON backup exported from Data.');
    }
    const data = cleanData(payload.data);
    if (!Object.hasOwn(data, TASKS) && !EVENT_KEYS.some(key => Object.hasOwn(data, key))) throw new Error('This file contains no Todo List records.');
    readState(data);
    return data;
  }
  function readState(data) {
    const state = parse(data[TASKS], { title: 'Today’s focus', tasks: [], orderMode: 'date' }, 'Tasks');
    if (!state || typeof state !== 'object' || !Array.isArray(state.tasks)) throw new Error('The backup task list is invalid.');
    const events = EVENT_KEYS.flatMap(key => {
      const items = parse(data[key], [], 'Events');
      if (!Array.isArray(items)) throw new Error('The backup event list is invalid.');
      return items;
    });
    if (state.tasks.length + events.length > 10000) throw new Error('This backup contains too many records.');
    for (const record of [...state.tasks, ...events]) {
      if (record?.id != null && ((typeof record.id !== 'string' && !Number.isFinite(record.id)) || String(record.id).length > 200 || ['__proto__','prototype','constructor'].includes(String(record.id)))) throw new Error('A record in this backup has an invalid identifier.');
    }
    for (const task of state.tasks) {
      if (!task || typeof task !== 'object' || typeof (task.task ?? task.text) !== 'string') throw new Error('A task in the backup is invalid.');
    }
    for (const event of events) {
      if (!event || typeof event !== 'object' || typeof event.title !== 'string') throw new Error('An event in the backup is invalid.');
    }
    return { ...state, events };
  }
  function preview(currentInput, incomingInput, { choices = {}, owner = 'local', now = Date.now() } = {}) {
    const current = cleanData(currentInput || {}), incoming = cleanData(incomingInput || {});
    const left = readState(current), right = readState(incoming);
    const conflicts = [], unresolved = [], additions = { tasks: [], events: [] }, counts = { tasksAdded: 0, eventsAdded: 0, tasksMatched: 0, eventsMatched: 0 };
    const incomingTaskIds = new Map();
    function choose(key, title, kind, currentValue, incomingValue) {
      conflicts.push({ key, title, kind, current: currentValue, incoming: incomingValue });
      if (!['current', 'incoming'].includes(choices[key])) unresolved.push(key);
      return choices[key] === 'incoming' ? incomingValue : currentValue;
    }
    function records(currentItems, incomingItems, kind) {
      const output = [], byId = new Map(), byContent = new Map(), incomingPositions = new Set(), addedPositions = new Set();
      function add(raw, fromIncoming) {
        const content = fingerprint(raw, kind);
        let position = raw.id ? byId.get(String(raw.id)) : undefined;
        if (position === undefined && fromIncoming) position = (byContent.get(content) || []).find(index => !incomingPositions.has(index));
        let id = String(raw.id || `${kind}-${hash(content)}`);
        if (position === undefined) {
          // Distinct occurrences already in either list are not silently discarded.
          if (byId.has(id)) id += `-${output.length}`;
          position = output.length; output.push({ ...raw, id });
          if (fromIncoming) { counts[kind === 'task' ? 'tasksAdded' : 'eventsAdded']++; addedPositions.add(position); }
        } else {
          const existing = output[position], item = { ...raw, id: existing.id };
          const combined = { ...existing, ...item };
          const differing = Object.keys(item).filter(key => key !== 'id' && Object.hasOwn(existing, key) && canonical(existing[key]) !== canonical(item[key]));
          const result = differing.length && fromIncoming
            ? choose(`${kind}:${existing.id}`, String(existing.task ?? existing.title), kind, existing, combined)
            : combined;
          output[position] = { ...result, id: existing.id };
          if (fromIncoming) counts[kind === 'task' ? 'tasksMatched' : 'eventsMatched']++;
        }
        byId.set(id, position);
        if (raw.id) byId.set(String(raw.id), position);
        const positions = byContent.get(content) || [];
        if (!positions.includes(position)) positions.push(position);
        byContent.set(content, positions);
        if (fromIncoming) incomingPositions.add(position);
        if (kind === 'task' && fromIncoming && raw.id) incomingTaskIds.set(String(raw.id), output[position].id);
      }
      currentItems.forEach(item => add(item, false)); incomingItems.forEach(item => add(item, true));
      additions[kind === 'task' ? 'tasks' : 'events'] = [...addedPositions].map(position => output[position]);
      return output;
    }
    const tasks = records(left.tasks, right.tasks, 'task');
    const events = records(left.events, right.events, 'event');
    let title = left.title || 'Today’s focus';
    if (!left.tasks.length && !left.events.length) title = right.title || title;
    else if (right.title && title !== right.title && right.title !== 'Today’s focus') title = choose('setting:title', 'List title', 'setting', title, right.title);
    const data = { ...current, [TASKS]: JSON.stringify({ ...left, events: undefined, title, tasks }), [EVENTS]: JSON.stringify(events) };
    EVENT_KEYS.slice(1).forEach(key => { data[key] = null; });
    for (const key of SETTINGS) {
      if (!incoming[key]) continue;
      data[key] = current[key] && current[key] !== incoming[key] ? choose(`setting:${key}`, key.replace('todo-', '').replaceAll('-', ' '), 'setting', current[key], incoming[key]) : incoming[key];
    }
    const existingTimers = parse(current['todo-task-timers-v1'], {}, 'Timers');
    const importedTimers = parse(incoming['todo-task-timers-v1'], {}, 'Timers');
    const timers = { ...(existingTimers.timers || {}) };
    for (const [sourceId, timer] of Object.entries(importedTimers.timers || {})) {
      if (!timer || typeof timer !== 'object') continue;
      const id = incomingTaskIds.get(sourceId) || sourceId;
      if (timers[id] || !tasks.some(task => task.id === id && !task.completed)) continue;
      const remainingMs = timer.status === 'running' ? Math.max(0, Number(timer.endAt) - now) : Number(timer.remainingMs);
      if (!Number.isFinite(remainingMs)) continue;
      timers[id] = { ...timer, id, status: remainingMs > 0 ? 'paused' : 'expired', remainingMs, endAt: null };
    }
    for (const id of Object.keys(timers)) if (!tasks.some(task => task.id === id && !task.completed)) delete timers[id];
    data['todo-task-timers-v1'] = JSON.stringify({ ...existingTimers, timers, selected: timers[existingTimers.selected] ? existingTimers.selected : Object.keys(timers)[0] || null, owner });
    return { data, conflicts, unresolved, additions, counts: { ...counts, tasks: tasks.length, events: events.length }, canSave: unresolved.length === 0 };
  }
  const api = { cleanData, readBackup, preview, canonical, keys: KEYS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TodoBackupMerge = api;
})(globalThis);
