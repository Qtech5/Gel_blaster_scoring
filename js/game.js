/**
 * Game module – pure FFA scoring logic, no DOM.
 *
 * All action functions return { game, snapshot } so the caller
 * can push snapshot onto an undo stack.
 */
const Game = (() => {

  function createPlayer(name) {
    return { name, score: 0, lives: 2, streak: 0, maxStreak: 0, kills: 0, deaths: 0, isOut: false };
  }

  /** Create a fresh game state. */
  function create(playerNames) {
    return {
      id: Date.now().toString(),
      startedAt: new Date().toISOString(),
      mode: 'ffa',
      players: playerNames.map(createPlayer),
      finished: false,
      winner: null,
      isPerfectWin: false,
    };
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /** Return alive players with their original index attached. */
  function alivePlayers(game) {
    return game.players.map((p, i) => ({ ...p, index: i })).filter(p => !p.isOut);
  }

  /**
   * Check if game should end and apply win bonuses.
   * Called after every action that might eliminate a player.
   */
  function checkEnd(game) {
    const alive = game.players.filter(p => !p.isOut);

    if (alive.length === 1) {
      const winner = alive[0];
      game.finished = true;
      game.winner = winner.name;
      // Perfect win: winner never lost a life (both lives intact)
      game.isPerfectWin = winner.lives === 2;
      winner.score += game.isPerfectWin ? 8 : 3;

    } else if (alive.length === 0) {
      // Simultaneous final elimination (trade between last two)
      game.finished = true;
      game.isPerfectWin = false;
      const sorted = [...game.players].sort((a, b) => b.score - a.score);
      // Declare winner only if there is a clear points leader
      game.winner = (sorted[0].score > (sorted[1]?.score ?? -Infinity)) ? sorted[0].name : null;
    }
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  /**
   * Record a kill: killerIdx earns kill credit, victimIdx loses 1 life.
   * Kill streak increments for killer; victim streak resets on life loss.
   */
  function recordKill(game, killerIdx, victimIdx) {
    const snapshot = clone(game);
    const g = clone(game);
    const killer = g.players[killerIdx];
    const victim  = g.players[victimIdx];

    // Award kill
    killer.kills  += 1;
    killer.streak += 1;
    killer.score  += killer.streak;                         // streak-based points
    killer.maxStreak = Math.max(killer.maxStreak, killer.streak);

    // Apply hit to victim
    victim.lives  -= 1;
    victim.score  -= 1;                                     // death penalty
    victim.deaths += 1;
    victim.streak  = 0;                                     // streak resets on life loss
    if (victim.lives <= 0) victim.isOut = true;

    checkEnd(g);
    return { game: g, snapshot };
  }

  /**
   * Record a trade: both players simultaneously score a kill on each other,
   * then both lose a life.  Points are calculated before the death penalty.
   */
  function recordTrade(game, idx1, idx2) {
    const snapshot = clone(game);
    const g = clone(game);
    const p1 = g.players[idx1];
    const p2 = g.players[idx2];

    // Both get kill credit (at their next streak level) simultaneously
    p1.kills  += 1; p1.streak += 1; p1.score += p1.streak; p1.maxStreak = Math.max(p1.maxStreak, p1.streak);
    p2.kills  += 1; p2.streak += 1; p2.score += p2.streak; p2.maxStreak = Math.max(p2.maxStreak, p2.streak);

    // Both take the hit
    p1.lives -= 1; p1.score -= 1; p1.deaths += 1; p1.streak = 0; if (p1.lives <= 0) p1.isOut = true;
    p2.lives -= 1; p2.score -= 1; p2.deaths += 1; p2.streak = 0; if (p2.lives <= 0) p2.isOut = true;

    checkEnd(g);
    return { game: g, snapshot };
  }

  /**
   * Force-end the game when the host taps "End Game" with >1 alive.
   * Highest-score alive player gets the standard +3 win bonus.
   */
  function forceEnd(game) {
    const snapshot = clone(game);
    const g = clone(game);
    const alive = g.players.filter(p => !p.isOut);

    if (alive.length === 1) {
      checkEnd(g);
    } else if (alive.length > 1) {
      alive.sort((a, b) => b.score - a.score);
      g.finished = true;
      g.isPerfectWin = false;
      g.winner = alive[0].name;
      g.players.find(p => p.name === alive[0].name).score += 3;
    } else {
      g.finished = true;
      g.winner = null;
    }
    return { game: g, snapshot };
  }

  // ─── Preview helpers (no state mutation) ────────────────────────────────────

  function previewKill(game, killerIdx, victimIdx) {
    const killer = game.players[killerIdx];
    const victim  = game.players[victimIdx];
    const killPts = killer.streak + 1;
    return {
      killerName: killer.name, killPts,
      victimName: victim.name,
      victimNewLives: victim.lives - 1,
      victimEliminated: victim.lives - 1 <= 0,
    };
  }

  function previewTrade(game, idx1, idx2) {
    const p1 = game.players[idx1];
    const p2 = game.players[idx2];
    return {
      p1: { name: p1.name, killPts: p1.streak + 1, net: p1.streak, newLives: p1.lives - 1, eliminated: p1.lives - 1 <= 0 },
      p2: { name: p2.name, killPts: p2.streak + 1, net: p2.streak, newLives: p2.lives - 1, eliminated: p2.lives - 1 <= 0 },
    };
  }

  // ─── Match summary (for history + leaderboard) ──────────────────────────────

  function buildSummary(game) {
    return {
      id: game.id,
      startedAt: game.startedAt,
      finishedAt: new Date().toISOString(),
      mode: game.mode,
      winner: game.winner,
      isPerfectWin: game.isPerfectWin,
      players: game.players.map(p => ({
        name: p.name, score: p.score, kills: p.kills,
        deaths: p.deaths, maxStreak: p.maxStreak,
      })),
    };
  }

  return { create, alivePlayers, recordKill, recordTrade, forceEnd, previewKill, previewTrade, buildSummary };
})();
