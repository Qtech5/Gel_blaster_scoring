/**
 * Storage module – all localStorage read/write operations.
 */
const Storage = (() => {
  const KEYS = {
    PLAYERS:      'gbst_players',
    LEADERBOARD:  'gbst_leaderboard',
    HISTORY:      'gbst_history',
    CURRENT_GAME: 'gbst_current_game',
    DARK_MODE:    'gbst_dark_mode',
  };

  function get(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  }
  function set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.error('Storage write error', e); }
  }
  function remove(key) { localStorage.removeItem(key); }

  return {
    getSavedPlayers:    ()  => get(KEYS.PLAYERS) || [],
    savePlayers:        (p) => set(KEYS.PLAYERS, p),

    getLeaderboard:     ()  => get(KEYS.LEADERBOARD) || {},
    saveLeaderboard:    (l) => set(KEYS.LEADERBOARD, l),
    resetLeaderboard:   ()  => remove(KEYS.LEADERBOARD),

    getHistory:         ()  => get(KEYS.HISTORY) || [],
    addToHistory(match) {
      const h = get(KEYS.HISTORY) || [];
      h.unshift(match);
      set(KEYS.HISTORY, h);
    },
    deleteFromHistory(id) {
      const h = (get(KEYS.HISTORY) || []).filter(m => m.id !== id);
      set(KEYS.HISTORY, h);
    },
    clearHistory: () => remove(KEYS.HISTORY),

    getCurrentGame:   ()  => get(KEYS.CURRENT_GAME),
    saveCurrentGame:  (d) => set(KEYS.CURRENT_GAME, d),
    clearCurrentGame: ()  => remove(KEYS.CURRENT_GAME),

    getDarkMode:  ()  => get(KEYS.DARK_MODE) ?? true,
    saveDarkMode: (v) => set(KEYS.DARK_MODE, v),
  };
})();
