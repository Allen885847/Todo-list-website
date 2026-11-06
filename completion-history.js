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
  function cleanRate(value) {
    if (!value || !Number.isInteger(value.total) || value.total < 0 || !Number.isInteger(value.completed) || value.completed < 0 || value.completed > value.total || !iso(value.updatedAt)) return null;
    return {total:value.total,completed:value.completed,updatedAt:value.updatedAt,finalized:value.finalized === true};
  }
  const dayNumber = day => { const [y,m,d] = day.split('-').map(Number); return Date.UTC(y,m-1,d)/86400000; };
  function cleanBonusDetails(value,day,ids) {
    const result = Object.create(null);
    for (const id of ids) {
      const item = value?.[id];
      if (!item || typeof item.title !== 'string' || !item.title.trim() || !iso(item.at)) continue;
      const due = validDay(item.due) ? item.due : '';
      const earlyDays = due ? Math.max(0,dayNumber(due)-dayNumber(day)) : 0;
      if (item.extra !== true && !earlyDays) continue;
      result[id] = {title:item.title.trim().slice(0,1000),at:item.at,due,extra:item.extra === true};
    }
    return result;
  }
  function cleanFinishEdits(value) {
    const result=Object.create(null);
    for(const [day,entry] of Object.entries(value || {})) {
      const original=cleanStamp(entry?.original),corrected=cleanStamp(entry?.corrected);
      if(validDay(day) && original && corrected && iso(entry.updatedAt)) result[day]={original,corrected,showEdited:entry.showEdited===true,updatedAt:entry.updatedAt};
    }
    return result;
  }
  const timeInput = time => {
    const seconds=Math.floor(time.minutes*60+0.000001);
    return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(value=>String(value).padStart(2,'0')).join(':');
  };
  function editFinish(value,day,{date,time,showEdited=false},{now=new Date()}={}) {
    const history=read(value),entry=history.days[day];
    if(!validDay(day) || !entry?.finish) throw new Error('This point no longer has a recorded finish time. Reopen Task stats and try again.');
    if(!validDay(date) || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time || '')) throw new Error('Enter a valid finish date and time.');
    const [year,month,d]=date.split('-').map(Number),[hours,minutes,seconds=0]=time.split(':').map(Number);
    const selected=new Date(year,month-1,d,hours,minutes,seconds);
    if(localDay(selected)!==date || selected.getHours()!==hours || selected.getMinutes()!==minutes || selected.getSeconds()!==seconds) throw new Error('That local time does not exist because the clocks change. Choose another time.');
    const previous=history.finishEdits[day],current=previous?.corrected || entry.finish;
    const unchanged=current.day===date && timeInput(current)===(time.length===5?time+':00':time);
    const corrected=unchanged?current:stamp(selected);
    const updatedAt=new Date(Math.max(now.getTime(),previous?Date.parse(previous.updatedAt)+1:0)).toISOString();
    history.finishEdits[day]={original:previous?.original || entry.finish,corrected,showEdited:showEdited===true,updatedAt};
    return history;
  }
  function read(value) {
    if (typeof value === 'string' && value) value = JSON.parse(value);
    if (value == null || value === '') return {schemaVersion:1,started:null,rateStarted:null,finishEdits:Object.create(null),completions:Object.create(null),days:Object.create(null)};
    if (value.schemaVersion !== 1 || !value.days || typeof value.days !== 'object' || !value.completions || typeof value.completions !== 'object') throw new Error('Completion history is not a supported format.');
    const result = {schemaVersion:1,started:cleanStamp(value.started),rateStarted:cleanStamp(value.rateStarted),finishEdits:cleanFinishEdits(value.finishEdits),completions:Object.create(null),days:Object.create(null)};
    for (const [id,entry] of Object.entries(value.completions)) {
      if (!validId(id) || !iso(entry?.updatedAt)) continue;
      result.completions[id] = {updatedAt:entry.updatedAt,completion:cleanStamp(entry.completion)};
    }
    for (const [day,entry] of Object.entries(value.days)) {
      if (!validDay(day) || !iso(entry?.updatedAt) || !Number.isInteger(entry.regularTotal) || entry.regularTotal < 0 || !Number.isInteger(entry.regularIncomplete) || entry.regularIncomplete < 0 || entry.regularIncomplete > entry.regularTotal) continue;
      const finish = cleanStamp(entry.finish);
      result.days[day] = {updatedAt:entry.updatedAt,regularTotal:entry.regularTotal,regularIncomplete:entry.regularIncomplete,finish:finish && finish.day <= day ? finish : null,reason:['finished','incomplete','no-tasks','missing-time'].includes(entry.reason)?entry.reason:'missing-time',bonus:[...new Set((Array.isArray(entry.bonus)?entry.bonus:[]).filter(validId))].sort(),rate:cleanRate(entry.rate)};
    }
    for (const [day,entry] of Object.entries(result.days)) entry.bonusDetails = cleanBonusDetails(value.days[day].bonusDetails,day,entry.bonus);
    return result;
  }
  function merge(left, right, idMap = {}) {
    const current = read(left), incoming = read(right);
    const remap = id => typeof idMap.get === 'function' ? idMap.get(id) || id : Object.hasOwn(idMap,id) ? idMap[id] : id;
    if (incoming.started && (!current.started || incoming.started.at < current.started.at)) current.started = incoming.started;
    if (incoming.rateStarted && (!current.rateStarted || incoming.rateStarted.at < current.rateStarted.at)) current.rateStarted = incoming.rateStarted;
    // Manual corrections are independent of automatic day snapshots, so an
    // older client or a midnight observation cannot erase them.
    for(const [day,entry] of Object.entries(incoming.finishEdits)) {
      const old=current.finishEdits[day];
      if(!old || entry.updatedAt>old.updatedAt || (entry.updatedAt===old.updatedAt && JSON.stringify(entry)>JSON.stringify(old))) current.finishEdits[day]=entry;
    }
    for (const [source,entry] of Object.entries(incoming.completions)) {
      const id = remap(source); if (!validId(id)) continue;
      if (!current.completions[id] || entry.updatedAt > current.completions[id].updatedAt) current.completions[id] = entry;
    }
    for (const [day,entry] of Object.entries(incoming.days)) {
      const existing = current.days[day];
      const bonus = [...new Set([...(existing?.bonus || []),...entry.bonus.map(remap).filter(validId)])].sort();
      // Rate observations have their own timestamp: older clients and later-day
      // finalization must not replace a newer daily count with a stale snapshot.
      const oldRate = existing?.rate, newRate = entry.rate;
      let rate = !oldRate || (newRate && newRate.updatedAt > oldRate.updatedAt) ? newRate : oldRate;
      if (rate && oldRate && newRate && oldRate.updatedAt === newRate.updatedAt && oldRate.total === newRate.total && oldRate.completed === newRate.completed) rate = {...rate,finalized:oldRate.finalized || newRate.finalized};
      const bonusDetails = {...existing?.bonusDetails};
      for (const [source,item] of Object.entries(entry.bonusDetails)) {
        const id = remap(source); if (!validId(id)) continue;
        const old = bonusDetails[id];
        if (!old || item.at < old.at || (item.at === old.at && JSON.stringify(item) < JSON.stringify(old))) bonusDetails[id] = item;
      }
      current.days[day] = {...(!existing || entry.updatedAt > existing.updatedAt ? entry : existing),bonus,bonusDetails,rate:rate || null};
    }
    return current;
  }
  const dueDay = task => task?.date ? `${task.date.year}-${String(task.date.month).padStart(2,'0')}-${String(task.date.day).padStart(2,'0')}` : '';
  const isExtra = task => String(task?.label || '').trim().toLowerCase() === 'extra';
  function update(value, tasks, {now = new Date(), transition = null, taskMutation = false} = {}) {
    const history = read(value), time = stamp(now), today = time.day;
    history.started ||= time;
    history.rateStarted ||= time;
    // Every task change checkpoints today's totals. On rollover/reopening seal
    // those saved observations before active-list cleanup; never rebuild old days
    // from today's edited, removed, or late-completed tasks.
    for (const [day,entry] of Object.entries(history.days)) {
      if (day < today && entry.rate) entry.rate.finalized = true;
    }
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
    const bonusDetails = {...history.days[today]?.bonusDetails};
    if (target?.completed && !transition.before && (isExtra(target) || (validDay(dueDay(target)) && dueDay(target) > today))) {
      const id = String(target.id);
      // Freeze details at the first qualifying completion. Later edits and rechecks
      // must not rewrite what this historical daily count represents.
      if (!bonus.has(id)) bonusDetails[id] = {title:String(target.task || '').trim(),at:time.at,due:dueDay(target),extra:isExtra(target)};
      bonus.add(id);
    }
    const regular = list.filter(task => !isExtra(task) && dueDay(task) === today);
    const incomplete = regular.filter(task => !task.completed).length;
    const known = regular.map(task => history.completions[String(task.id)]?.completion || null);
    let finish = null, reason = !regular.length ? 'no-tasks' : incomplete ? 'incomplete' : 'missing-time';
    if (regular.length && !incomplete && known.every(time => time && time.day <= today && time.at <= now.toISOString())) {
      finish = known.reduce((latest,time) => !latest || time.at > latest.at ? time : latest,null); reason = 'finished';
    }
    const old = history.days[today];
    const completed = regular.filter(task => task.completed && (!validDay(task.completedOn) || task.completedOn <= today)).length;
    const rateUnchanged = !taskMutation && !changed && old?.rate && old.rate.total === regular.length && old.rate.completed === completed && !old.rate.finalized;
    const rate = {total:regular.length,completed,updatedAt:rateUnchanged ? old.rate.updatedAt : time.at,finalized:false};
    const entry = {regularTotal:regular.length,regularIncomplete:incomplete,finish,reason,bonus:[...bonus].sort(),bonusDetails,rate};
    const same = old && JSON.stringify({...old,updatedAt:undefined}) === JSON.stringify({...entry,updatedAt:undefined});
    history.days[today] = {...entry,updatedAt:same ? old.updatedAt : time.at};
    return read(history);
  }
  function rows(value, {now = new Date(),range = 7} = {}) {
    const history = read(value), size = range === 30 ? 30 : 7, result = [];
    for (let ago = size-1; ago >= 0; ago--) {
      const date = new Date(now.getFullYear(),now.getMonth(),now.getDate()-ago,12), day = localDay(date), record = history.days[day];
      result.push({day,finish:record?.finish ? history.finishEdits[day]?.corrected || record.finish : null,finishEdit:record?.finish ? history.finishEdits[day] || null : null,count:record ? record.bonus.length : null,bonusTasks:record ? record.bonus.filter(id=>record.bonusDetails[id]).map(id=>{const item=record.bonusDetails[id];return {id,...item,earlyDays:item.due?Math.max(0,dayNumber(item.due)-dayNumber(day)):0};}) : [],reason:record?.reason || 'unrecorded',regularTotal:record?.regularTotal ?? null,rate:record?.rate?.total > 0 ? {...record.rate,percent:Math.round(record.rate.completed / record.rate.total * 100)} : null});
    }
    return result;
  }
  const api = {KEY,localDay,read,merge,update,rows,stamp,editFinish,timeInput};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TodoCompletionHistory = api;
})(globalThis);
