(() => {
  const dialog = document.querySelector('#stats-dialog'), button = document.querySelector('#open-stats');
  if (!dialog || !button) return;
  const H = window.TodoCompletionHistory, ranges = [...dialog.querySelectorAll('[data-stats-range]')];
  const tabs = [...dialog.querySelectorAll('[data-stats-tab]')], info = document.querySelector('#stats-info-toggle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ns = 'http://www.w3.org/2000/svg';
  let range = 7, activeTab = 'finish', tooltipTarget, infoAnimation, viewTransition, pendingView, pendingRender = false;
  const statsCard = dialog.querySelector('.stats-card');
  const bonusCard = document.querySelector('#stats-bonus-card'), bonusDetail = document.querySelector('#stats-bonus-detail');
  let bonusTarget, bonusRow, bonusHideTimer, detailInert = [];
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
  const finishEditor=document.querySelector('#stats-finish-editor'),finishForm=document.querySelector('#stats-finish-form');
  const editDate=document.querySelector('#stats-finish-edit-date'),editTime=document.querySelector('#stats-finish-edit-time'),editLabel=document.querySelector('#stats-finish-edit-label'),editSave=document.querySelector('#stats-finish-edit-save'),editStatus=document.querySelector('#stats-finish-edit-status');
  let editingDay=null,editorReturnFocus,finishSaving=false;
  function openFinishEditor(row,target) {
    if(!row.finish || viewTransition)return;
    hideTooltip();hideBonus();closeInfo(false);editingDay=row.day;editorReturnFocus=target;
    editDate.value=row.finish.day;editTime.value=H.timeInput(row.finish);editLabel.checked=row.finishEdit?.showEdited===true;editStatus.hidden=true;
    document.querySelector('#stats-finish-edit-context').textContent=`Recorded finish for tasks due ${dateLabel(row.day,{month:'short',day:'numeric',year:'numeric'})}. Changes apply only to Task stats; the point stays under its tasks’ due date.`;
    const original=row.finishEdit?.original || row.finish;
    document.querySelector('#stats-finish-edit-original').textContent=`Original: ${dateLabel(original.day,{month:'short',day:'numeric',year:'numeric'})} · ${clock(original)} (${original.zone}). The original timestamp is retained.`;
    prepareDialogOpening(finishEditor);finishEditor.showModal();editDate.focus();
  }
  function closeFinishEditor() {if(!finishSaving)closeDialogAnimated(finishEditor);}
  document.querySelector('#stats-finish-edit-close').addEventListener('click',closeFinishEditor);
  document.querySelector('#stats-finish-edit-cancel').addEventListener('click',closeFinishEditor);
  finishEditor.addEventListener('cancel',event=>{event.preventDefault();closeFinishEditor()});
  finishEditor.addEventListener('click',event=>{if(event.target===finishEditor)closeFinishEditor()});
  finishEditor.addEventListener('close',()=>{editingDay=null;finishEditor.classList.remove('is-closing','is-opening');(editorReturnFocus?.isConnected?editorReturnFocus:tabs.find(tab=>tab.dataset.statsTab==='finish'))?.focus()});
  finishForm.addEventListener('submit',async event=>{
    event.preventDefault();if(finishSaving || !editingDay)return;
    finishSaving=true;editSave.disabled=true;editSave.textContent='Saving…';editStatus.hidden=true;
    editDate.disabled=editTime.disabled=editLabel.disabled=true;
    try {
      await window.TodoTaskHistory.editFinish(editingDay,{date:editDate.value,time:editTime.value,showEdited:editLabel.checked});
      render();closeDialogAnimated(finishEditor);
    } catch(error) {editStatus.textContent=error.message || 'The corrected finish time could not be saved. Please try again.';editStatus.hidden=false;}
    finally {finishSaving=false;editSave.disabled=false;editSave.textContent='Save changes';editDate.disabled=editTime.disabled=editLabel.disabled=false;}
  });
  const infoPanel = document.querySelector('#stats-info');
  function setInfo(expanded,animate=true) {
    if (animate && info.getAttribute('aria-expanded') === String(expanded)) return;
    infoAnimation?.cancel(); infoAnimation = null;
    info.setAttribute('aria-expanded',String(expanded)); infoPanel.inert = !expanded;
    if (reducedMotion.matches || !animate) { infoPanel.hidden = !expanded; return; }
    infoPanel.hidden = false;
    const animation = infoPanel.animate(expanded ? [{opacity:0,transform:'translateY(-5px)'},{opacity:1,transform:'translateY(0)'}] : [{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-5px)'}],{duration:160,easing:'cubic-bezier(0.16,1,0.3,1)'});
    infoAnimation = animation;
    animation.finished.then(()=>{if(infoAnimation === animation){infoPanel.hidden = !expanded;infoAnimation=null}}).catch(()=>{});
  }
  function closeInfo(animate=true) { setInfo(false,animate); }
  function hideBonus() {
    window.clearTimeout(bonusHideTimer); bonusTarget?.setAttribute('aria-expanded','false');
    bonusTarget = null; bonusRow = null; bonusCard.hidden = true;
  }
  function deferHideBonus() { window.clearTimeout(bonusHideTimer); bonusHideTimer=window.setTimeout(()=>{if(!bonusCard.contains(document.activeElement))hideBonus()},160); }
  function populateBonus(prefix,row,all=false) {
    document.querySelector(`#${prefix}-title`).textContent = dateLabel(row.day,{month:'short',day:'numeric',year:'numeric'});
    document.querySelector(`#${prefix}-count`).textContent = `${row.count} ${row.count===1?'task':'tasks'} completed`;
    const list = document.querySelector(`#${prefix}-items`); list.replaceChildren();
    const tasks = row.bonusTasks || [];
    for (const task of all ? tasks : tasks.slice(0,3)) {
      const item = document.createElement('li'), title = document.createElement('span'), labels = document.createElement('span');
      title.className='stats-bonus-task-name'; title.textContent=task.title; labels.className='stats-bonus-labels';
      for (const text of [task.extra?'Extra':'',task.earlyDays?`Early · ${task.earlyDays} ${task.earlyDays===1?'day':'days'} early`:''].filter(Boolean)) {
        const badge=document.createElement('span');badge.className=`stats-bonus-badge${text==='Extra'?' is-extra':''}`;badge.textContent=text;labels.append(badge);
      }
      item.append(title,labels);list.append(item);
    }
    const unknown = Math.max(0,row.count-tasks.length), note = document.querySelector(`#${prefix}-note`);
    note.hidden = !unknown; note.textContent = unknown ? `Details were not recorded for ${unknown} ${unknown===1?'task':'tasks'}.` : '';
  }
  function showBonus(target,row) {
    window.clearTimeout(bonusHideTimer); hideTooltip();
    if (bonusTarget !== target) bonusTarget?.setAttribute('aria-expanded','false');
    bonusTarget=target; bonusRow=row; target.setAttribute('aria-expanded','true');
    populateBonus('stats-bonus-card',row); bonusCard.hidden=false;
    document.querySelector('#stats-bonus-view-all').hidden = row.count<=3;
    const host=statsCard.getBoundingClientRect(), point=target.getBoundingClientRect(), box=bonusCard.getBoundingClientRect();
    bonusCard.style.left=`${Math.max(12,Math.min(host.width-box.width-12,point.left-host.left+point.width/2-box.width/2))}px`;
    bonusCard.style.top=`${Math.max(72,Math.min(host.height-box.height-12,point.top-host.top-box.height-10))}px`;
  }
  function closeBonusDetail() {
    const open = !bonusDetail.hidden; bonusDetail.hidden=true;
    detailInert.forEach(node=>node.inert=false);detailInert=[];
    if(open) tabs.find(tab=>tab.dataset.statsTab===activeTab)?.focus();
  }
  bonusCard.addEventListener('pointerenter',()=>window.clearTimeout(bonusHideTimer));
  bonusCard.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch')deferHideBonus()});
  bonusCard.addEventListener('focusout',deferHideBonus);
  document.querySelector('#stats-bonus-view-all').addEventListener('click',()=>{
    if(!bonusRow)return; populateBonus('stats-bonus-detail',bonusRow,true); hideBonus(); bonusDetail.hidden=false;
    detailInert=[...statsCard.children].filter(node=>node!==bonusDetail && !node.inert);detailInert.forEach(node=>node.inert=true);
    if(!reducedMotion.matches)bonusDetail.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(0.16,1,0.3,1)'});
    document.querySelector('#stats-bonus-detail-close').focus();
  });
  document.querySelector('#stats-bonus-detail-close').addEventListener('click',closeBonusDetail);
  const chartStage = dialog.querySelector('.stats-charts');
  function syncControls() {
    tabs.forEach(tab=>{
      const active=tab.dataset.statsTab===activeTab;
      tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden=!active;
    });
    ranges.forEach(control=>control.setAttribute('aria-pressed',String(Number(control.dataset.statsRange)===range)));
  }
  function stopViewTransition() {
    const transition=viewTransition;viewTransition=null;pendingView=null;pendingRender=false;
    transition?.animation?.cancel();transition?.snapshot.remove();
    tabs.forEach(tab=>document.getElementById(tab.getAttribute('aria-controls')).inert=false);
    chartStage.removeAttribute('aria-busy');
  }
  function finishViewTransition(transition) {
    if(viewTransition!==transition)return;
    transition.snapshot.remove();transition.panel.inert=false;viewTransition=null;chartStage.removeAttribute('aria-busy');
    const next=pendingView;pendingView=null;
    if(next && (next.tab!==activeTab || next.range!==range)) requestView(next);
    else if(pendingRender) {pendingRender=false;render();}
  }
  function requestView(change,animate=true) {
    const next={tab:activeTab,range,...pendingView,...change};
    if(viewTransition) {pendingView=next;return;}
    if(next.tab===activeTab && next.range===range)return;
    closeInfo();closeBonusDetail();hideBonus();hideTooltip();
    const previous=document.getElementById(`stats-${activeTab}-panel`);
    const snapshot=animate && !reducedMotion.matches ? previous.cloneNode(true) : null;
    if(snapshot) {
      snapshot.removeAttribute('id');snapshot.removeAttribute('hidden');snapshot.setAttribute('aria-hidden','true');snapshot.inert=true;
      snapshot.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
      snapshot.querySelectorAll('[tabindex]').forEach(node=>node.removeAttribute('tabindex'));
      snapshot.querySelectorAll('.stats-tooltip').forEach(node=>node.remove());
      snapshot.classList.add('stats-chart-snapshot');
      // Mount an opaque copy before changing any live content. It is outside
      // layout, so the old and new charts never compete for a grid track.
      chartStage.append(snapshot);
    }
    const panel=document.getElementById(`stats-${next.tab}-panel`);
    const transition=snapshot?{snapshot,panel,animation:null}:null;
    viewTransition=transition;
    activeTab=next.tab;range=next.range;syncControls();renderCurrent();
    if(!transition)return;
    panel.inert=true;chartStage.setAttribute('aria-busy','true');
    // Give the new SVG two paint frames at its final, fixed dimensions. Keep
    // the old chart fully visible throughout preparation, then dissolve it.
    requestAnimationFrame(()=>{
      if(viewTransition!==transition)return;
      requestAnimationFrame(()=>{
        if(viewTransition!==transition)return;
        const animation=snapshot.animate([{opacity:1},{opacity:0}],{duration:260,easing:'cubic-bezier(0.4,0,0.2,1)',fill:'forwards'});
        transition.animation=animation;
        animation.finished.then(()=>finishViewTransition(transition)).catch(()=>{});
      });
    });
  }
  function changeRange(next) { requestView({range:next}); }
  dialog.addEventListener('pointerdown',event=>{
    if (bonusTarget && !bonusTarget.contains(event.target) && !bonusCard.contains(event.target)) hideBonus();
    if (!info.contains(event.target) && !infoPanel.contains(event.target)) closeInfo();
    if (tooltipTarget && !tooltipTarget.contains(event.target)) hideTooltip();
  });
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape' && (!bonusCard.hidden || !bonusDetail.hidden)) {event.preventDefault();event.stopPropagation();hideBonus();closeBonusDetail();return;}
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
    const left = 74, right = 24, top = 22, bottom = 38;
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
        const target=element('g',{class:'stats-bonus-target stats-mark',tabindex:0,role:'button','aria-label':`${dateLabel(row.day)}: ${row.count} tasks completed. View details.`,'aria-expanded':'false','aria-controls':'stats-bonus-card'});
        bar.removeAttribute('tabindex');bar.classList.remove('stats-mark');
        target.append(element('rect',{x:x(index)-Math.max(bw,Math.min(28,w/rows.length))/2,y:Math.min(y(row.count),top+h-24),width:Math.max(bw,Math.min(28,w/rows.length)),height:Math.max(24,top+h-y(row.count)),class:'stats-point-hit'}),bar);
        target.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showBonus(target,row)});
        target.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch')deferHideBonus()});
        target.addEventListener('focus',()=>showBonus(target,row));target.addEventListener('blur',deferHideBonus);
        target.addEventListener('click',()=>showBonus(target,row));
        target.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showBonus(target,row);document.querySelector('#stats-bonus-view-all').hidden || document.querySelector('#stats-bonus-view-all').focus();}});
        svg.append(target);
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
        const text = `${dateLabel(row.finish.day)} · ${clock(row.finish)}${row.finish.day!==row.day?` · Tasks due ${dateLabel(row.day)}`:''}${row.finishEdit?.showEdited?' · Edited':''}`;
        const target = element('g',{class:'stats-finish-target stats-mark',tabindex:0,role:'button','aria-label':`${label}. Edit recorded finish time.`,'aria-haspopup':'dialog','aria-controls':'stats-finish-editor'});
        target.append(element('ellipse',{cx:x(index),cy:y(value),rx:Math.max(4,Math.min(14,w/rows.length/2)),ry:14,class:'stats-point-hit'}),dot);
        target.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showTooltip(target,text)});
        target.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch')hideTooltip()});
        target.addEventListener('focus',()=>showTooltip(target,text));
        target.addEventListener('blur',hideTooltip);
        target.addEventListener('click',()=>openFinishEditor(row,target));
        target.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openFinishEditor(row,target)}});
        svg.append(target);
        if(row.finishEdit?.showEdited) {
          const nearEdge=x(index)>width-80;
          svg.append(element('text',{x:x(index)+(nearEdge?-8:8),y:Math.max(14,y(value)-10),'text-anchor':nearEdge?'end':'start',class:'stats-edited-label'},'Edited'));
        }
      } else {
        dot.setAttribute('tabindex','0'); dot.setAttribute('aria-label',label);
        dot.classList.add('stats-mark'); dot.append(element('title',{},label)); svg.append(dot);
      }
    });
  }
  function render() {
    if(viewTransition) {pendingRender=true;return;}
    renderCurrent();
  }
  function renderCurrent() {
    if (!dialog.open) return;
    try {
      hideBonus();
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
          if(index===1&&row.finishEdit?.showEdited)td.textContent+=' · Edited';
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
  function selectTab(selected,animate=true) { requestView({tab:selected.dataset.statsTab},animate); }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>selectTab(tab));
    tab.addEventListener('keydown',event=>{
      let next = event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
      if(next===null)return;event.preventDefault();tabs[next].focus();selectTab(tabs[next]);
    });
  });
  info.addEventListener('click',()=>{
    hideBonus();setInfo(info.getAttribute('aria-expanded') !== 'true');
  });
  button.addEventListener('click',()=>{
    closeInfo(false);hideBonus();closeBonusDetail();stopViewTransition(); dialog.querySelector('.stats-data').open = false;
    window.TodoTaskHistory.observe(); prepareDialogOpening(dialog); dialog.showModal(); render();
    requestAnimationFrame(()=>{render();tabs.find(tab=>tab.dataset.statsTab===activeTab)?.focus()});
  });
  ranges.forEach(control=>control.addEventListener('click',()=>changeRange(Number(control.dataset.statsRange)===30?30:7,control)));
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialogAnimated(dialog)});
  dialog.addEventListener('close',()=>{hideTooltip();hideBonus();closeBonusDetail();closeInfo(false);stopViewTransition();dialog.classList.remove('is-closing','is-opening')});
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialogAnimated(dialog)});
  window.addEventListener('storage',event=>{if(event.key===H.KEY)render()});
  window.addEventListener('todo-history-changed',render);
  window.addEventListener('resize',()=>{const next=pendingView;stopViewTransition();if(next && (next.tab!==activeTab || next.range!==range))requestView(next,false);else render()});
})();
