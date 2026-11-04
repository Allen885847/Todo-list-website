(() => {
  const dialog = document.querySelector('#stats-dialog'), button = document.querySelector('#open-stats');
  if (!dialog || !button) return;
  const H = window.TodoCompletionHistory, ranges = [...dialog.querySelectorAll('[data-stats-range]')];
  const ns = 'http://www.w3.org/2000/svg';
  let range = 7;
  const dateLabel = (day,options={month:'short',day:'numeric'}) => new Date(`${day}T12:00:00`).toLocaleDateString('en',options);
  function clock(time) {
    const hour = Math.floor(time.minutes/60), minute = Math.floor(time.minutes%60);
    return `${hour%12 || 12}:${String(minute).padStart(2,'0')} ${hour<12?'AM':'PM'}`;
  }
  function element(name,attrs={},text) {
    const node = document.createElementNS(ns,name);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function chart(svg,rows,type) {
    const width = Math.max(220,svg.clientWidth || 460), height = 250, left = type === 'finish'?74:42, right = 24, top = 22, bottom = 38;
    const w = width-left-right, h = height-top-bottom;
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`); svg.replaceChildren();
    const maxCount = Math.max(0,...rows.map(row=>row.count || 0)), max = type === 'finish'?1440:Math.max(4,Math.ceil(maxCount/4)*4);
    const y = value => top+h*(1-value/max), x = index => left+(index+.5)*w/rows.length;
    for (let tick=0;tick<=4;tick++) {
      const value = max*tick/4;
      svg.append(element('line',{x1:left,x2:width-right,y1:y(value),y2:y(value),class:'stats-gridline'}));
      const label = type === 'finish'?['12 AM','6 AM','12 PM','6 PM','12 AM (+1)'][tick]:String(value);
      svg.append(element('text',{x:left-9,y:y(value)+4,'text-anchor':'end',class:'stats-axis-label'},label));
    }
    const ticks = Math.max(2,Math.min(rows.length,Math.floor(w/60)));
    const tickIndices = new Set(Array.from({length:ticks},(_,index)=>Math.round(index*(rows.length-1)/(ticks-1))));
    rows.forEach((row,index) => {
      if (tickIndices.has(index)) svg.append(element('text',{x:x(index),y:height-12,'text-anchor':'middle',class:'stats-axis-label'},dateLabel(row.day)));
    });
    let path = '', connected = false;
    rows.forEach((row,index) => {
      if (type === 'finish') {
        if (!row.finish) { connected=false; return; }
        path += `${connected?' L':' M'}${x(index)} ${y(row.finish.minutes)}`; connected=true;
      } else if (row.count !== null) {
        const bw = Math.max(2,Math.min(30,w/rows.length*.64)), bar = element('rect',{x:x(index)-bw/2,y:y(row.count),width:bw,height:top+h-y(row.count),rx:3,class:'stats-bar stats-mark',tabindex:0,'aria-label':`${dateLabel(row.day)}: ${row.count} Extra and early tasks`});
        bar.append(element('title',{},`${dateLabel(row.day)} · ${row.count} Extra & Early`)); svg.append(bar);
        if (range===7 || row.count>0) svg.append(element('text',{x:x(index),y:y(row.count)-7,'text-anchor':'middle',class:'stats-axis-label'},row.count));
      }
    });
    if (type === 'finish') {
      svg.append(element('path',{d:path,class:'stats-line'}));
      rows.forEach((row,index) => {
        if (!row.finish) return;
        const label = `${dateLabel(row.day)} · Finished ${dateLabel(row.finish.day)} at ${clock(row.finish)} (${row.finish.zone})`;
        const dot = element('circle',{cx:x(index),cy:y(row.finish.minutes),r:4,class:'stats-point stats-mark',tabindex:0,'aria-label':label}); dot.append(element('title',{},label)); svg.append(dot);
      });
    }
  }
  function render() {
    if (!dialog.open) return;
    try {
      const history = window.TodoTaskHistory.read(), rows = H.rows(history,{range});
      document.querySelector('#stats-period').textContent = `${dateLabel(rows[0].day)} – ${dateLabel(rows.at(-1).day,{month:'short',day:'numeric',year:'numeric'})}`;
      chart(document.querySelector('#stats-finish-chart'),rows,'finish'); chart(document.querySelector('#stats-bonus-chart'),rows,'bonus');
      document.querySelector('#stats-finish-empty').hidden = rows.some(row=>row.finish);
      document.querySelector('#stats-bonus-empty').hidden = rows.some(row=>row.count !== null);
      const body = document.querySelector('#stats-table-body'); body.replaceChildren();
      const reasons = {'no-tasks':'No regular tasks due','incomplete':'Regular tasks were not all completed','missing-time':'An exact completion time was not recorded','unrecorded':'No history recorded'};
      for (const row of rows) {
        const tr = document.createElement('tr');
        const finish = row.finish ? `${row.finish.day !== row.day ? dateLabel(row.finish.day)+' · ' : ''}${clock(row.finish)}` : '—';
        [dateLabel(row.day,{month:'short',day:'numeric',year:'numeric'}),finish,row.count===null?'—':String(row.count)].forEach((text,index)=>{const td=document.createElement('td');td.textContent=text;if(index===1&&!row.finish)td.title=reasons[row.reason]||'';tr.append(td)});
        body.append(tr);
      }
      document.querySelector('#stats-history-note').textContent = window.TodoTaskHistory.error || (history.started ? `Only recorded completions are included. Tracking began ${dateLabel(history.started.day,{month:'short',day:'numeric',year:'numeric'})} at ${clock(history.started)}; the first day may be partial. Missing history is shown as —. Completion dates from earlier versions do not provide exact finish times.` : 'Completion tracking begins with this update. Older finish times and counts are not estimated.');
    } catch {
      document.querySelector('#stats-history-note').textContent = 'Completion history could not be read. Your tasks are unchanged. Keep a backup before trying to restore history.';
    }
  }
  button.addEventListener('click',()=>{
    window.TodoTaskHistory.observe(); prepareDialogOpening(dialog); dialog.showModal(); render();
    requestAnimationFrame(()=>{render();ranges.find(b=>Number(b.dataset.statsRange)===range)?.focus()});
  });
  ranges.forEach(control=>control.addEventListener('click',()=>{range=Number(control.dataset.statsRange)===30?30:7;ranges.forEach(b=>b.setAttribute('aria-pressed',String(b===control)));render()}));
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialogAnimated(dialog)});
  dialog.addEventListener('close',()=>dialog.classList.remove('is-closing','is-opening'));
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialogAnimated(dialog)});
  window.addEventListener('storage',event=>{if(event.key===H.KEY)render()});
  window.addEventListener('todo-history-changed',render);
  window.addEventListener('resize',render);
})();
