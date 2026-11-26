  // Agenda's page for visitors: today's times of every app that is on (the process lists them in its status).
  el('namePanel').classList.add('hidden');
  draw = () => {
    const s = status, list = s.today || [];
    if (s.title) { document.title = s.title; document.querySelector('h1').textContent = (s.icon || '') + ' ' + s.title; }
    el('today').replaceChildren(...(list.length ? list.map((x) => {
      const d = document.createElement('div'), w = document.createElement('span'), b = document.createElement('b');
      w.className = 'when'; w.textContent = x.times; b.textContent = x.icon + ' ' + x.title; d.append(w, b); return d;
    }) : [Object.assign(document.createElement('div'), { className: 'empty', textContent: s.at ? 'Nothing to play today. Come back another day!' : 'Loading…' })]));
    say('');
  };
