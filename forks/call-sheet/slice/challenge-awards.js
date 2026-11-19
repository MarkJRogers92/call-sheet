// An earned sticker belongs to this browser across Quick Battle and Dynasty.
(() => {
  'use strict';
  const catalog = Object.freeze([
    { id: 'need_six', name: 'Two-Minute Drill', symbol: '6' },
    { id: 'goal_line_stand', name: 'Brick Wall', symbol: 'W' },
    { id: 'four_minute_offense', name: 'Clock Killer', symbol: '00' },
  ].map(Object.freeze));
  const prefix = 'callsheet.challenge.sticker.v1.';
  const session = new Set();

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

  globalThis.ChallengeAwards = Object.freeze({
    catalog, get, earn, list: () => catalog.filter(item => get(item.id)),
  });
})();
