(function () {
  const describe = value => {
    if (typeof value !== 'object' || !value) return String(value ?? 'Not set');
    const labels = { task: 'Task', title: 'Event', subject: 'Subject', date: 'Due date', label: 'Label', completed: 'Completed', completedOn: 'Completed on', startDate: 'Start date', endDate: 'End date', startTime: 'Start time', endTime: 'End time', holiday: 'Holiday', allDay: 'No specific time' };
    return Object.entries(value).filter(([key]) => key !== 'id').map(([key, item]) => {
      if (key === 'date' && item) item = `${item.year}-${String(item.month).padStart(2,'0')}-${String(item.day).padStart(2,'0')}`;
      return `${labels[key] || key}: ${typeof item === 'object' && item ? JSON.stringify(item) : (typeof item === 'boolean' ? (item ? 'Yes' : 'No') : String(item || 'Not set'))}`;
    }).join('\n');
  };
  window.TodoMergeReview = {
    render(container, plan, { choices, currentLabel = 'Website', incomingLabel = 'Desktop', onChange }) {
      container.replaceChildren();
      const summary = document.createElement('p');
      summary.textContent = `${plan.counts.tasksAdded} new ${plan.counts.tasksAdded === 1 ? 'task' : 'tasks'} · ${plan.counts.eventsAdded} new ${plan.counts.eventsAdded === 1 ? 'event' : 'events'}. Matching records are combined, and existing records are kept.`;
      container.append(summary);
      for (const [kind, title] of [['tasks', 'New tasks'], ['events', 'New events']]) {
        const records = plan.additions?.[kind] || [];
        if (!records.length) continue;
        const details = document.createElement('details'); details.className = 'desktop-details'; details.open = records.length <= 5;
        const label = document.createElement('summary'); label.textContent = `${title} (${records.length})`;
        const list = document.createElement('ul'); list.className = 'merge-additions';
        for (const record of records) { const item = document.createElement('li'), text = document.createElement('pre'); text.textContent = describe(record); item.append(text); list.append(item); }
        details.append(label, list); container.append(details);
      }
      if (!plan.conflicts.length) return;
      const help = document.createElement('p'); help.textContent = 'Some saved details differ. Choose which version to keep for each item. A recovery backup is kept before saving.'; container.append(help);
      for (const conflict of plan.conflicts) {
        const fieldset = document.createElement('fieldset'); fieldset.className = 'merge-conflict';
        const legend = document.createElement('legend'); legend.textContent = conflict.title; fieldset.append(legend);
        const alternatives = document.createElement('div'); alternatives.className = 'merge-options';
        for (const [value, label, record] of [['current', currentLabel, conflict.current], ['incoming', incomingLabel, conflict.incoming]]) {
          const option = document.createElement('label');
          const radio = document.createElement('input'); radio.type = 'radio'; radio.name = `merge-${conflict.key}`; radio.value = value; radio.checked = choices[conflict.key] === value;
          radio.addEventListener('change', () => { choices[conflict.key] = value; onChange(); });
          const name = document.createElement('strong'); name.textContent = `Keep ${label} version`;
          const text = document.createElement('pre'); text.textContent = describe(record);
          option.append(radio, name, text); alternatives.append(option);
        }
        fieldset.append(alternatives); container.append(fieldset);
      }
    },
  };
})();
