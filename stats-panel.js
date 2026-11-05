(() => {
  const dialog = document.querySelector('#stats-dialog'), button = document.querySelector('#open-stats');
  if (!dialog || !button) return;
  const H = window.TodoCompletionHistory, ranges = [...dialog.querySelectorAll('[data-stats-range]')];
  const tabs = [...dialog.querySelectorAll('[data-stats-tab]')], info = document.querySelector('#stats-info-toggle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ns = 'http://www.w3.org/2000/svg';
  let range = 7, activeTab = 'finish', panelAnimations = [], tooltipTarget;
  const tooltip = document.createElement('div');
  tooltip.id = 'stats-finish-tooltip'; tooltip.className = 'stats-tooltip';
  tooltip.setAttribute('role','tooltip'); tooltip.hidden = true;
  const finishPanel = document.querySelector('#stats-finish-chart').parentElement;
  finishPanel.append(tooltip);
  function hideTooltip() {
    tooltipTarget?.removeAttribute('aria-describedby');
    tooltipTarget = null; tooltip.hidden = true;
  }
  function showTooltip(target,label) {
    hideTooltip(); tooltipTarget = target; tooltip.textContent = label; tooltip.hidden = false;
    target.setAttribute('aria-describedby',tooltip.id);
    const host = finishPanel.getBoundingClientRect(), point = target.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const left = Math.max(4,Math.min(host.width-box.width-4,point.left+point.width/2-host.left-box.width/2));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(0,point.top-host.top-box.height-10)}px`;
  }
  const infoPanel = document.querySelector('#stats-info');
  function closeInfo() { info.setAttribute('aria-expanded','false'); infoPanel.hidden = true; }
  dialog.addEventListener('pointerdown',event=>{
    if (!info.contains(event.target) && !infoPanel.contains(event.target)) closeInfo();
    if (tooltipTarget && !tooltipTarget.contains(event.target)) hideTooltip();
  });
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape' && !infoPanel.hidden) { event.preventDefault(); event.stopPropagation(); closeInfo(); info.focus(); return; }
    if(event.key==='Escape' && tooltipTarget) { event.preventDefault(); event.stopPropagation(); hideTooltip(); }
  });
  const dateLabel = (day,options={month:'short',day:'numeric'}) => new Date(`${day}T12:00:00`).toLocaleDateString('en',options);
  function clock(time) {
    const hour = Math.floor(time.minutes/60), minute = Math.floor(time.minutes%60);
    return `${hour%12 || 12}:${String(minute).padStart(2,'0')} ${hour<12?'AM':'PM'}`;
  }
  const rateLabel = rate => `${rate.completed}/${rate.total} completed · ${rate.percent}%`;
  function element(name,attrs={},text) {
    const node = document.createElementNS(ns,name);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function chart(svg,rows,type) {
    const width = Math.max(210,svg.clientWidth || 700), height = Math.max(120,svg.clientHeight || (width < 480 ? 260 : 300));
    const left = type === 'finish'?74:44, right = 24, top = 22, bottom = 38;
    const w = width-left-right, h = height-top-bottom;
    hideTooltip();
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`); svg.replaceChildren();
    const maxCount = Math.max(0,...rows.map(row=>row.count || 0));
    const max = type === 'finish'?1440:type === 'rate'?100:Math.max(4,Math.ceil(maxCount/4)*4);
    const y = value => top+h*(1-value/max), x = index => left+(index+.5)*w/rows.length;
    for (let tick=0;tick<=4;tick++) {
      const value = max*tick/4;
      svg.append(element('line',{x1:left,x2:width-right,y1:y(value),y2:y(value),class:'stats-gridline'}));
      const label = type === 'finish'?['12 AM','6 AM','12 PM','6 PM','12 AM (+1)'][tick]:`${value}${type === 'rate'?'%':''}`;
      svg.append(element('text',{x:left-9,y:y(value)+4,'text-anchor':'end',class:'stats-axis-label'},label));
    }
    const ticks = Math.max(2,Math.min(rows.length,Math.floor(w/70)));
    const step = Math.max(1,Math.ceil((rows.length-1)/(ticks-1)));
    const indices = Array.from({length:Math.ceil(rows.length/step)},(_,index)=>index*step);
    if (indices.at(-1) !== rows.length-1) {
      if (rows.length-1-indices.at(-1) < step) indices.pop();
      indices.push(rows.length-1);
    }
    const tickIndices = new Set(indices);
    rows.forEach((row,index) => {
      if (tickIndices.has(index)) svg.append(element('text',{x:x(index),y:height-12,'text-anchor':'middle',class:'stats-axis-label'},dateLabel(row.day)));
    });
    if (type === 'bonus') {
      rows.forEach((row,index) => {
        if (row.count === null) return;
        const bw = Math.max(2,Math.min(30,w/rows.length*.64));
        const bar = element('rect',{x:x(index)-bw/2,y:y(row.count),width:bw,height:top+h-y(row.count),rx:3,class:'stats-bar stats-mark',tabindex:0,'aria-label':`${dateLabel(row.day)}: ${row.count} Extra and early tasks`});
        bar.append(element('title',{},`${dateLabel(row.day)} · ${row.count} Extra & Early`)); svg.append(bar);
        if (range===7 || row.count>0) svg.append(element('text',{x:x(index),y:y(row.count)-7,'text-anchor':'middle',class:'stats-axis-label'},row.count));
      });
      return;
    }
    let path = '', connected = false;
    rows.forEach((row,index) => {
      const value = type === 'rate' ? row.rate?.percent : row.finish?.minutes;
      if (value === undefined) { connected=false; return; }
      path += `${connected?' L':' M'}${x(index)} ${y(value)}`; connected=true;
    });
    svg.append(element('path',{d:path,class:'stats-line'}));
    rows.forEach((row,index) => {
      const value = type === 'rate' ? row.rate?.percent : row.finish?.minutes;
      if (value === undefined) return;
      const label = type === 'rate' ? `${dateLabel(row.day)} · ${rateLabel(row.rate)}`
        : `${dateLabel(row.day)} · Finished ${dateLabel(row.finish.day)} at ${clock(row.finish)} (${row.finish.zone})`;
      const dot = element('circle',{cx:x(index),cy:y(value),r:4,class:'stats-point'});
      if (type === 'finish') {
        const text = `${dateLabel(row.day)} · ${clock(row.finish)}`;
        const target = element('g',{class:'stats-finish-target stats-mark',tabindex:0,role:'img','aria-label':label});
        target.append(element('ellipse',{cx:x(index),cy:y(value),rx:Math.max(4,Math.min(14,w/rows.length/2)),ry:14,class:'stats-point-hit'}),dot);
        target.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showTooltip(target,text)});
        target.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch')hideTooltip()});
        target.addEventListener('focus',()=>showTooltip(target,text));
        target.addEventListener('blur',hideTooltip);
        target.addEventListener('click',()=>showTooltip(target,text));
        svg.append(target);
      } else {
        dot.setAttribute('tabindex','0'); dot.setAttribute('aria-label',label);
        dot.classList.add('stats-mark'); dot.append(element('title',{},label)); svg.append(dot);
      }
    });
  }
  function render() {
    if (!dialog.open) return;
    try {
      const history = window.TodoTaskHistory.read(), rows = H.rows(history,{range});
      document.querySelector('#stats-period').textContent = `${dateLabel(rows[0].day)} – ${dateLabel(rows.at(-1).day,{month:'short',day:'numeric',year:'numeric'})}`;
      chart(document.querySelector(`#stats-${activeTab}-chart`),rows,activeTab);
      document.querySelector('#stats-finish-empty').hidden = rows.some(row=>row.finish);
      document.querySelector('#stats-bonus-empty').hidden = rows.some(row=>row.count !== null);
      document.querySelector('#stats-rate-empty').hidden = rows.some(row=>row.rate);
      const today = rows.at(-1);
      document.querySelector('#stats-rate-summary').textContent = today.rate ? `Today · ${rateLabel(today.rate)}` : 'No regular tasks due today';
      const body = document.querySelector('#stats-table-body'); body.replaceChildren();
      const reasons = {'no-tasks':'No regular tasks due','incomplete':'Regular tasks were not all completed','missing-time':'An exact completion time was not recorded','unrecorded':'No history recorded'};
      for (const row of rows) {
        const tr = document.createElement('tr');
        const finish = row.finish ? `${row.finish.day !== row.day ? dateLabel(row.finish.day)+' · ' : ''}${clock(row.finish)}` : '—';
        [dateLabel(row.day,{month:'short',day:'numeric',year:'numeric'}),finish,row.count===null?'—':String(row.count),row.rate?rateLabel(row.rate):'—'].forEach((text,index)=>{
          const td=document.createElement('td');td.textContent=text;
          if(index===1&&!row.finish)td.title=reasons[row.reason]||'';
          if(index===3&&!row.rate)td.title='No eligible tasks or no completion-rate history recorded';
          tr.append(td);
        });
        body.append(tr);
      }
      const startText = time => `${dateLabel(time.day,{month:'short',day:'numeric',year:'numeric'})} at ${clock(time)}`;
      document.querySelector('#stats-history-note').textContent = history.started ? `Finish Time and Extra & Early tracking began ${startText(history.started)}. Missing history is shown as —; older exact completion times are not estimated.` : 'Tracking begins with this update. Older finish times and counts are not estimated.';
      document.querySelector('#stats-rate-note').textContent = history.rateStarted ? `Completion Rate tracking began ${startText(history.rateStarted)}. The first day reflects tasks available when tracking started; earlier days stay blank.` : 'Completion Rate starts recording with this update. Earlier days stay blank.';
      const status = document.querySelector('#stats-status');status.textContent = window.TodoTaskHistory.error || '';status.hidden = !status.textContent;
    } catch {
      const status = document.querySelector('#stats-status');status.hidden = false;
      status.textContent = 'Completion history could not be read. Your tasks are unchanged. Keep a backup before trying to restore history.';
    }
  }
  function stopCrossfade() {
    panelAnimations.forEach(animation=>animation.cancel()); panelAnimations = [];
    tabs.forEach(tab=>{
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      panel.classList.remove('is-leaving'); panel.inert = false; panel.removeAttribute('aria-hidden');
    });
  }
  function selectTab(selected,animate=true) {
    const previous = document.getElementById(tabs.find(tab=>tab.dataset.statsTab===activeTab)?.getAttribute('aria-controls'));
    const changed = activeTab !== selected.dataset.statsTab;
    stopCrossfade(); activeTab = selected.dataset.statsTab;
    tabs.forEach(tab=>{
      const active = tab === selected;
      tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    });
    render();
    const panel = document.getElementById(selected.getAttribute('aria-controls'));
    if (changed && animate && !reducedMotion.matches) {
      previous.classList.add('is-leaving'); previous.inert = true; previous.setAttribute('aria-hidden','true');
      const options = {duration:200,easing:'cubic-bezier(0.16,1,0.3,1)'};
      const animations = [previous.animate([{opacity:1},{opacity:0}],options),panel.animate([{opacity:0},{opacity:1}],options)];
      panelAnimations = animations;
      Promise.all(animations.map(animation=>animation.finished)).then(()=>{
        if (panelAnimations === animations) stopCrossfade();
      }).catch(()=>{});
    }
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>selectTab(tab));
    tab.addEventListener('keydown',event=>{
      let next = event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
      if(next===null)return;event.preventDefault();tabs[next].focus();selectTab(tabs[next]);
    });
  });
  info.addEventListener('click',()=>{
    const expanded = info.getAttribute('aria-expanded') !== 'true';info.setAttribute('aria-expanded',String(expanded));infoPanel.hidden = !expanded;
  });
  button.addEventListener('click',()=>{
    closeInfo(); dialog.querySelector('.stats-data').open = false; stopCrossfade();
    window.TodoTaskHistory.observe(); prepareDialogOpening(dialog); dialog.showModal(); render();
    requestAnimationFrame(()=>{render();tabs.find(tab=>tab.dataset.statsTab===activeTab)?.focus()});
  });
  ranges.forEach(control=>control.addEventListener('click',()=>{range=Number(control.dataset.statsRange)===30?30:7;ranges.forEach(b=>b.setAttribute('aria-pressed',String(b===control)));render()}));
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialogAnimated(dialog)});
  dialog.addEventListener('close',()=>{hideTooltip();closeInfo();stopCrossfade();dialog.classList.remove('is-closing','is-opening')});
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialogAnimated(dialog)});
  window.addEventListener('storage',event=>{if(event.key===H.KEY)render()});
  window.addEventListener('todo-history-changed',render);
  window.addEventListener('resize',render);
})();
