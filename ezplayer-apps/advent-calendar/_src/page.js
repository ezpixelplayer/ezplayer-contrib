  //@include-app theme.mjs
  el('namePanel').classList.add('hidden');
  draw = () => {
    const s = status, n = s.days || 24, day = s.day || 0;
    const now = new Date(), y = now.getMonth() === 11 && now.getDate() > 25 ? now.getFullYear() + 1 : now.getFullYear();
    const today0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());   // whole days in UTC: no daylight saving hour
    let toXmas = Math.round((Date.UTC(y, 11, 25) - today0) / 86400000);
    const ev = THEME.event, em = THEME.emoji || '🎄';
    if (ev) {   // a theme pack: the big day is the day after the last door
      let by = now.getFullYear() - 1;   // the next big day (today counts)
      while (Date.UTC(by, (s.month || 12) - 1, (s.first || 1) + n) < today0) by++;
      toXmas = Math.round((Date.UTC(by, (s.month || 12) - 1, (s.first || 1) + n) - today0) / 86400000);
    }
    el('count').textContent = ev ? (day === 0 ? '📅 The calendar opens on ' + (s.first || 1) + '/' + (s.month || 12) + '. ' + toXmas + ' days to ' + ev + '!'
      : toXmas === 0 ? em + ' ' + THEME.greeting + ' ' + em : toXmas === 1 ? em + ' Tomorrow is ' + ev + '!' : em + ' ' + toXmas + ' days to ' + ev)
      : day === 0 ? '📅 The calendar opens on ' + (s.first || 1) + '/' + (s.month || 12) + '. ' + toXmas + ' days to Christmas!'
      : toXmas === 0 ? '🎄 Merry Christmas! 🎄' : toXmas === 1 ? '🎄 Tomorrow is Christmas!' : '🎄 ' + toXmas + ' days to Christmas';
    el('doors').replaceChildren(...[...Array(n)].map((_, i) => {
      const d = i + 1, info = (s.doors || [])[i], b = document.createElement('button'); b.type = 'button';
      if (!info) { b.className = 'shut'; b.textContent = d; b.setAttribute('aria-label', 'Door ' + d + ', not open yet'); b.onclick = () => { el('note').textContent = 'Door ' + d + ' is still closed. Come back on that day!'; }; return b; }
      if (d === day) b.className = 'today';
      const e = document.createElement('span'); e.className = 'e'; e.textContent = info[0]; b.append(e, String(d)); b.title = info[1];
      b.setAttribute('aria-label', 'Door ' + d + ': ' + info[1]);
      b.onclick = () => { send({ type: 'open', door: d }); say('Door ' + d + ': ' + info[1] + '! Watch the lights ✨'); };
      return b;
    }));
    let t = s.message || '';
    if (s.now && app && s.now.id === app.clientId) t = '✨ Your door is on the lights now!';
    else { const q = (s.queue || []).findIndex((x) => app && x.id === app.clientId); if (q >= 0) t = q === 0 ? 'Your door is next!' : 'Your door is number ' + (q + 1) + ' in line.'; }
    say(t);
  };
