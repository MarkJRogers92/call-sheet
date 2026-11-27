// Challenge records and stickers belong to the browser across Quick Battle and Dynasty.
(() => {
  'use strict';
  const catalog = Object.freeze([
    { id: 'need_six', name: 'Two-Minute Drill', symbol: '6' },
    { id: 'goal_line_stand', name: 'Brick Wall', symbol: 'W' },
    { id: 'four_minute_offense', name: 'Clock Killer', symbol: '00' },
    { id: 'three_drive', name: 'Complete Game', symbol: 'III' },
  ].map(Object.freeze));
  const prefix = 'callsheet.challenge.sticker.v1.';
  const recordPrefix = 'callsheet.challenge.record.v1.';
  const session = new Set();
  const records = new Map();

  function get(id) {
    const sticker = catalog.find(item => item.id === id);
    if (!sticker) return null;
    if (!session.has(id)) {
      try {
        if (globalThis.localStorage.getItem(prefix + id) === '1') session.add(id);
      } catch { /* Blocked browser storage still allows stickers for this session. */ }
    }
    return session.has(id) ? sticker : null;
  }

  function earn(id) {
    if (!catalog.some(item => item.id === id) || get(id)) return false;
    session.add(id);
    try {
      globalThis.localStorage.setItem(prefix + id, '1');
    } catch { /* The in-memory award remains available for retries. */ }
    return true;
  }

  function recordKey(id, look) {
    if (!catalog.some(item => item.id === id)) return null;
    if (look) {
      const battle = globalThis.CallSheet?.battle;
      const supported = id === 'three_drive'
        ? battle?.THREE_DRIVE_CHALLENGE?.playbooks?.some(playbook => playbook.id === look)
        : battle?.DRIVE_CHALLENGES?.find(item => item.id === id)?.alternate?.id === look;
      if (!supported) return null;
    }
    return recordPrefix + id + '.' + (look || 'original');
  }

  const validCount = n => Number.isSafeInteger(n) && n >= 0;
  function validRun(run) {
    return run && typeof run.won === 'boolean' && validCount(run.snaps);
  }

  function readRecord(key) {
    const cached = records.get(key);
    try {
      const record = JSON.parse(globalThis.localStorage.getItem(key) || 'null');
      if (record && validCount(record.attempts) && record.attempts > 0 && validCount(record.clears) &&
          record.clears <= record.attempts && (record.clears ? validCount(record.best) : record.best === null) &&
          validRun(record.last) && record.attempts >= (cached?.attempts ?? 0)) return record;
    } catch { /* Keep tracking in this session if browser storage is unavailable. */ }
    return cached || null;
  }

  function progress(id, look = null) {
    const key = recordKey(id, look);
    return key ? readRecord(key) : null;
  }

  function finish(id, look, run) {
    const key = recordKey(id, look);
    if (!key || !validRun(run)) return null;
    const past = readRecord(key), best = past?.best ?? null;
    const improved = run.won && (best === null || run.snaps < best);
    const record = {
      attempts: Math.min(Number.MAX_SAFE_INTEGER, (past?.attempts ?? 0) + 1),
      clears: Math.min(Number.MAX_SAFE_INTEGER, (past?.clears ?? 0) + Number(run.won)),
      best: improved ? run.snaps : best,
      last: { won: run.won, snaps: run.snaps },
    };
    records.set(key, record);
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(record));
    } catch { /* The same record remains available for retries in this session. */ }
    return { record, improved };
  }

  globalThis.ChallengeAwards = Object.freeze({
    catalog, get, earn, list: () => catalog.filter(item => get(item.id)), progress, finish,
  });
})();
