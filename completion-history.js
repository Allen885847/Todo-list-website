(function (root) {
  'use strict';
  const KEY = 'todo-completion-history-v1';
  const localDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const validDay = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const [year,month,day] = value.split('-').map(Number), date = new Date(year,month-1,day,12);
    return localDay(date) === value;
  };
  const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 200 && !['__proto__','constructor','prototype'].includes(id);
  const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  function stamp(date) {
    return { at:date.toISOString(), day:localDay(date), minutes:date.getHours()*60+date.getMinutes()+date.getSeconds()/60+date.getMilliseconds()/60000, zone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'local', offset:date.getTimezoneOffset() };
  }
  function cleanStamp(value) {
    if (!value || !iso(value.at) || !validDay(value.day) || !Number.isFinite(value.minutes) || value.minutes < 0 || value.minutes >= 1440) return null;
    return {at:value.at,day:value.day,minutes:value.minutes,zone:String(value.zone || 'local').slice(0,80),offset:Number.isFinite(value.offset)?value.offset:0};
  }
  function read(value) {
    if (typeof value === 'string' && value) value = JSON.parse(value);
    if (value == null || value === '') return {schemaVersion:1,started:null,completions:Object.create(null),days:Object.create(null)};
    if (value.schemaVersion !== 1 || !value.days || typeof value.days !== 'object' || !value.completions || typeof value.completions !== 'object') throw new Error('Completion history is not a supported format.');
    const result = {schemaVersion:1,started:cleanStamp(value.started),completions:Object.create(null),days:Object.create(null)};
    for (const [id,entry] of Object.entries(value.completions)) {
      if (!validId(id) || !iso(entry?.updatedAt)) continue;
      result.completions[id] = {updatedAt:entry.updatedAt,completion:cleanStamp(entry.completion)};
    }
    for (const [day,entry] of Object.entries(value.days)) {
      if (!validDay(day) || !iso(entry?.updatedAt) || !Number.isInteger(entry.regularTotal) || entry.regularTotal < 0 || !Number.isInteger(entry.regularIncomplete) || entry.regularIncomplete < 0 || entry.regularIncomplete > entry.regularTotal) continue;
      const finish = cleanStamp(entry.finish);
      result.days[day] = {updatedAt:entry.updatedAt,regularTotal:entry.regularTotal,regularIncomplete:entry.regularIncomplete,finish:finish && finish.day <= day ? finish : null,reason:['finished','incomplete','no-tasks','missing-time'].includes(entry.reason)?entry.reason:'missing-time',bonus:[...new Set((Array.isArray(entry.bonus)?entry.bonus:[]).filter(validId))].sort()};
    }
    return result;
  }
  function merge(left, right, idMap = {}) {
    const current = read(left), incoming = read(right);
    const remap = id => typeof idMap.get === 'function' ? idMap.get(id) || id : Object.hasOwn(idMap,id) ? idMap[id] : id;
    if (incoming.started && (!current.started || incoming.started.at < current.started.at)) current.started = incoming.started;
    for (const [source,entry] of Object.entries(incoming.completions)) {
      const id = remap(source); if (!validId(id)) continue;
      if (!current.completions[id] || entry.updatedAt > current.completions[id].updatedAt) current.completions[id] = entry;
    }
    for (const [day,entry] of Object.entries(incoming.days)) {
      const existing = current.days[day];
      const bonus = [...new Set([...(existing?.bonus || []),...entry.bonus.map(remap).filter(validId)])].sort();
      current.days[day] = {...(!existing || entry.updatedAt > existing.updatedAt ? entry : existing),bonus};
    }
    return current;
  }
  const dueDay = task => task?.date ? `${task.date.year}-${String(task.date.month).padStart(2,'0')}-${String(task.date.day).padStart(2,'0')}` : '';
  const isExtra = task => String(task?.label || '').trim().toLowerCase() === 'extra';
  function update(value, tasks, {now = new Date(), transition = null} = {}) {
    const history = read(value), time = stamp(now), today = time.day;
    history.started ||= time;
    const list = Array.isArray(tasks) ? tasks : [];
    const changed = transition && typeof transition.before === 'boolean' && typeof transition.after === 'boolean' && transition.before !== transition.after;
    const target = changed && list.find(task => String(task.id) === String(transition.id) && Boolean(task.completed) === transition.after);
    if (target && validId(String(target.id))) {
      history.completions[String(target.id)] = {updatedAt:time.at,completion:transition.after ? time : null};
    }
    // An imported/legacy completedOn has no clock time. Never manufacture one.
    for (const task of list) {
      const id = String(task?.id || ''), saved = history.completions[id];
      if (saved?.completion && (!task.completed || task.completedOn !== saved.completion.day)) history.completions[id] = {updatedAt:time.at,completion:null};
    }
    const bonus = new Set(history.days[today]?.bonus || []);
    if (target?.completed && !transition.before && (isExtra(target) || (validDay(dueDay(target)) && dueDay(target) > today))) bonus.add(String(target.id));
    const regular = list.filter(task => !isExtra(task) && dueDay(task) === today);
    const incomplete = regular.filter(task => !task.completed).length;
    const known = regular.map(task => history.completions[String(task.id)]?.completion || null);
    let finish = null, reason = !regular.length ? 'no-tasks' : incomplete ? 'incomplete' : 'missing-time';
    if (regular.length && !incomplete && known.every(time => time && time.day <= today && time.at <= now.toISOString())) {
      finish = known.reduce((latest,time) => !latest || time.at > latest.at ? time : latest,null); reason = 'finished';
    }
    const entry = {regularTotal:regular.length,regularIncomplete:incomplete,finish,reason,bonus:[...bonus].sort()};
    const old = history.days[today];
    const same = old && JSON.stringify({...old,updatedAt:undefined}) === JSON.stringify({...entry,updatedAt:undefined});
    history.days[today] = {...entry,updatedAt:same ? old.updatedAt : time.at};
    return read(history);
  }
  function rows(value, {now = new Date(),range = 7} = {}) {
    const history = read(value), size = range === 30 ? 30 : 7, result = [];
    for (let ago = size-1; ago >= 0; ago--) {
      const date = new Date(now.getFullYear(),now.getMonth(),now.getDate()-ago,12), day = localDay(date), record = history.days[day];
      result.push({day,finish:record?.finish || null,count:record ? record.bonus.length : null,reason:record?.reason || 'unrecorded',regularTotal:record?.regularTotal ?? null});
    }
    return result;
  }
  const api = {KEY,localDay,read,merge,update,rows,stamp};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TodoCompletionHistory = api;
})(globalThis);
