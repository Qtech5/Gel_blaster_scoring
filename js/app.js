/**
 * App – application state, routing, event handling, and rendering.
 * Depends on: storage.js, game.js
 */
const App = (() => {

  // ── State ───────────────────────────────────────────────────────────────────
  let currentGame     = null;
  let undoStack       = [];
  let newGamePlayers  = [];
  let lastGamePlayers = [];
  let lbSortKey       = 'totalPoints';
  let lastGameResult  = null;   // set after a game ends so leaderboard can show the result

  let killState  = { phase: 0, killerIdx: null, victimIdx: null };
  let tradeState = { idx1: null, idx2: null };

  const MAX_UNDO = 30;

  // ── Routing ─────────────────────────────────────────────────────────────────
  function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + id);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }

  function showHome() {
    lastGameResult = null;
    const saved = Storage.getCurrentGame();
    document.getElementById('resume-banner').classList.toggle('hidden', !saved);
    showView('home');
  }

  function showNewGame() {
    newGamePlayers = [];
    renderPlayerList();
    renderSavedPlayers();
    document.getElementById('player-name-input').value = '';
    showView('new-game');
    setTimeout(() => document.getElementById('player-name-input').focus(), 200);
  }

  function showLeaderboard() {
    renderLeaderboard();
    showView('leaderboard');
  }

  function showHistory() {
    renderHistory();
    showView('history');
  }

  function showRules() { showView('rules'); }

  function goHomeFromGame() { showHome(); }

  // ── Theme ───────────────────────────────────────────────────────────────────
  function toggleDarkMode() {
    const dark = !Storage.getDarkMode();
    Storage.saveDarkMode(dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  // ── New Game Setup ──────────────────────────────────────────────────────────
  function addPlayer() {
    const input = document.getElementById('player-name-input');
    const name  = input.value.trim();
    if (!name) return;
    if (newGamePlayers.includes(name)) { toast('Already added!'); return; }
    if (newGamePlayers.length >= 20)   { toast('Max 20 players'); return; }

    newGamePlayers.push(name);
    const saved = Storage.getSavedPlayers();
    if (!saved.includes(name)) { saved.push(name); Storage.savePlayers(saved); }

    input.value = '';
    renderPlayerList();
    renderSavedPlayers();
    input.focus();
  }

  function removePlayer(index) {
    newGamePlayers.splice(index, 1);
    renderPlayerList();
  }

  function addSavedPlayer(name) {
    if (newGamePlayers.includes(name)) { toast(name + ' already added'); return; }
    newGamePlayers.push(name);
    renderPlayerList();
  }

  function renderPlayerList() {
    const list = document.getElementById('player-list');
    const msg  = document.getElementById('player-count-msg');
    const btn  = document.getElementById('start-game-btn');

    list.innerHTML = newGamePlayers.map((name, i) =>
      '<div class="player-list-item">' +
        '<span>' + esc(name) + '</span>' +
        '<button class="remove-player-btn" onclick="App.removePlayer(' + i + ')">✕</button>' +
      '</div>'
    ).join('');

    const n = newGamePlayers.length;
    msg.textContent = n === 0 ? 'Add at least 2 players to start'
                    : n === 1 ? 'Add at least 1 more player'
                    : n + ' players ready';
    btn.disabled = n < 2;
  }

  function renderSavedPlayers() {
    const saved = Storage.getSavedPlayers();
    const row   = document.getElementById('saved-players-row');
    const list  = document.getElementById('saved-players-list');

    if (saved.length === 0) { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');

    list.innerHTML = saved.map(function(name) {
      // Use data attribute + delegation-safe onclick
      return '<button class="saved-player-chip" onclick="App.addSavedPlayer(this.dataset.name)" data-name="' + esc(name) + '">' + esc(name) + '</button>';
    }).join('');
  }

  function startGame() {
    if (newGamePlayers.length < 2) return;
    lastGamePlayers = [].concat(newGamePlayers);
    currentGame = Game.create(newGamePlayers);
    undoStack = [];
    saveGameState();
    renderGame();
    showView('game');
  }

  function resumeGame() {
    const saved = Storage.getCurrentGame();
    if (!saved) return;
    currentGame = saved.game;
    undoStack   = saved.undoStack || [];
    renderGame();
    showView('game');
  }

  function rematch() {
    if (!lastGamePlayers.length) { showHome(); return; }
    newGamePlayers = [].concat(lastGamePlayers);
    currentGame = Game.create(newGamePlayers);
    undoStack = [];
    lastGameResult = null;
    saveGameState();
    renderGame();
    showView('game');
  }

  // ── Live Game ───────────────────────────────────────────────────────────────
  function saveGameState() {
    Storage.saveCurrentGame({ game: currentGame, undoStack: undoStack });
  }

  function renderGame() {
    const grid    = document.getElementById('game-players-grid');
    const players = currentGame.players;
    const alive   = players.filter(function(p) { return !p.isOut; });

    // Find leader among alive
    var leaderIdx = -1;
    if (alive.length > 1) {
      var maxScore = -Infinity;
      for (var i = 0; i < players.length; i++) {
        if (!players[i].isOut && players[i].score > maxScore) {
          maxScore = players[i].score;
          leaderIdx = i;
        }
      }
    }

    var html = '';
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var isLeader = (i === leaderIdx);
      var livesStr = '';
      for (var j = 0; j < p.lives; j++) livesStr += '♥';
      for (var j = p.lives; j < 2; j++) livesStr += '♡';
      var streakHot = p.streak >= 3;

      html += '<div class="player-card ' + (p.isOut ? 'out' : '') + ' ' + (isLeader ? 'leader' : '') + '">';
      if (isLeader) html += '<div class="leader-crown">👑</div>';
      if (p.isOut)  html += '<div class="out-badge">OUT</div>';
      html += '<div class="player-card-top">';
      html += '  <div class="player-name">' + esc(p.name) + '</div>';
      html += '  <div class="player-lives">' + livesStr + '</div>';
      html += '</div>';
      html += '<div class="player-card-bottom">';
      html += '  <div><div class="player-score-val">' + p.score + ' pts</div></div>';
      html += '  <span class="streak-badge ' + (streakHot ? 'hot' : '') + '">🔥 ' + p.streak + '</span>';
      html += '  <div class="player-kd">K:' + p.kills + ' D:' + p.deaths + '</div>';
      html += '</div></div>';
    }
    grid.innerHTML = html;
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  function undoAction() {
    if (undoStack.length === 0) { toast('Nothing to undo'); return; }
    currentGame = undoStack.pop();
    saveGameState();
    renderGame();
    toast('Undone ↩');
  }

  function applyAction(result) {
    undoStack.push(result.snapshot);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    currentGame = result.game;
    saveGameState();
    renderGame();

    if (currentGame.finished) {
      // Brief pause so the user can see the final OUT badge, then end
      setTimeout(function() { finishGame(); }, 400);
    }
  }

  // ── Kill Modal ──────────────────────────────────────────────────────────────
  function startKillAction() {
    if (currentGame.finished) return;
    var alive = Game.alivePlayers(currentGame);
    if (alive.length < 2) { toast('Need 2+ alive players'); return; }
    killState = { phase: 1, killerIdx: null, victimIdx: null };
    openModal(buildKillModal);
  }

  function buildKillModal() {
    var alive = Game.alivePlayers(currentGame);
    if (alive.length < 2) return '<div class="modal-title">Not enough players</div><div class="modal-actions"><button class="btn btn-ghost" onclick="App.closeModal()">OK</button></div>';

    if (killState.phase === 1) {
      var btns = '';
      for (var i = 0; i < alive.length; i++) {
        var p = alive[i];
        btns += '<button class="player-select-btn" onclick="App.killSelectKiller(' + p.index + ')">' +
          esc(p.name) + '<span class="psbsub">Streak: ' + p.streak + ' → next +' + (p.streak + 1) + '</span></button>';
      }
      return '<div class="modal-title">⚔️ Who got the kill?</div>' +
        '<div class="modal-sub">Select the killer</div>' +
        '<div class="player-select-grid">' + btns + '</div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button></div>';
    }

    if (killState.phase === 2) {
      var killer = currentGame.players[killState.killerIdx];
      var btns = '';
      for (var i = 0; i < alive.length; i++) {
        var p = alive[i];
        if (p.index === killState.killerIdx) continue;
        var sel = (killState.victimIdx === p.index) ? 'selected' : '';
        btns += '<button class="player-select-btn ' + sel + '" onclick="App.killSelectVictim(' + p.index + ')">' +
          esc(p.name) + '<span class="psbsub">' + '♥'.repeat(p.lives) + ' ' + p.lives + ' lives</span></button>';
      }

      var preview = '';
      if (killState.victimIdx !== null) {
        var pv = Game.previewKill(currentGame, killState.killerIdx, killState.victimIdx);
        preview = '<div class="preview-box">' +
          '<div class="preview-row"><span>⚔️ ' + esc(pv.killerName) + '</span><span class="preview-pos">+' + pv.killPts + ' pts</span></div>' +
          '<div class="preview-row"><span>💀 ' + esc(pv.victimName) + '</span><span class="preview-neg">−1 pt, −1 life</span></div>' +
          (pv.victimEliminated ? '<div class="preview-elim">🔴 ' + esc(pv.victimName) + ' is eliminated!</div>' : '') +
          '</div>';
      }

      return '<div class="modal-title">⚔️ ' + esc(killer.name) + ' eliminated…</div>' +
        '<div class="modal-sub">Select the victim</div>' +
        '<div class="player-select-grid">' + btns + '</div>' +
        preview +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" onclick="App.killStep1()">← Back</button>' +
        '<button class="btn btn-primary" onclick="App.executeKill()"' + (killState.victimIdx === null ? ' disabled' : '') + '>Confirm Kill</button>' +
        '</div>';
    }

    return '';
  }

  function killStep1() {
    killState = { phase: 1, killerIdx: null, victimIdx: null };
    refreshModal(buildKillModal);
  }

  function killSelectKiller(idx) {
    killState.killerIdx = idx;
    killState.phase = 2;
    killState.victimIdx = null;
    refreshModal(buildKillModal);
  }

  function killSelectVictim(idx) {
    killState.victimIdx = idx;
    refreshModal(buildKillModal);
  }

  function executeKill() {
    if (killState.killerIdx === null || killState.victimIdx === null) return;
    var killerName = currentGame.players[killState.killerIdx].name;
    var victimName = currentGame.players[killState.victimIdx].name;
    closeModal();
    var result = Game.recordKill(currentGame, killState.killerIdx, killState.victimIdx);
    toast('⚔️ ' + killerName + ' → ' + victimName);
    applyAction(result);
  }

  // ── Trade Modal ─────────────────────────────────────────────────────────────
  function startTradeAction() {
    if (currentGame.finished) return;
    var alive = Game.alivePlayers(currentGame);
    if (alive.length < 2) { toast('Need 2+ alive players'); return; }
    tradeState = { idx1: null, idx2: null };
    openModal(buildTradeModal);
  }

  function buildTradeModal() {
    var alive = Game.alivePlayers(currentGame);
    if (alive.length < 2) return '<div class="modal-title">Not enough players</div><div class="modal-actions"><button class="btn btn-ghost" onclick="App.closeModal()">OK</button></div>';

    var both = (tradeState.idx1 !== null && tradeState.idx2 !== null);
    var btns = '';
    for (var i = 0; i < alive.length; i++) {
      var p = alive[i];
      var sel = (p.index === tradeState.idx1 || p.index === tradeState.idx2) ? 'selected' : '';
      btns += '<button class="player-select-btn ' + sel + '" onclick="App.tradeToggle(' + p.index + ')">' +
        esc(p.name) + '<span class="psbsub">Streak: ' + p.streak + ' → +' + (p.streak + 1) + '</span></button>';
    }

    var preview = '';
    if (both) {
      var pv = Game.previewTrade(currentGame, tradeState.idx1, tradeState.idx2);
      function tradeRow(s) {
        var cls = s.net >= 0 ? 'preview-pos' : 'preview-neg';
        var sign = s.net >= 0 ? '+' : '';
        return '<div class="preview-row"><span>🔄 ' + esc(s.name) + '</span><span class="' + cls + '">+' + s.killPts + ' kill, −1 life = ' + sign + s.net + '</span></div>' +
          (s.eliminated ? '<div class="preview-elim">🔴 ' + esc(s.name) + ' eliminated!</div>' : '');
      }
      preview = '<div class="preview-box">' + tradeRow(pv.p1) + tradeRow(pv.p2) + '</div>';
    }

    return '<div class="modal-title">🔄 Trade – Select 2 Players</div>' +
      '<div class="modal-sub">Both hit each other simultaneously</div>' +
      '<div class="player-select-grid">' + btns + '</div>' +
      preview +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>' +
      '<button class="btn btn-warning" onclick="App.executeTrade()"' + (both ? '' : ' disabled') + '>Confirm Trade</button>' +
      '</div>';
  }

  function tradeToggle(idx) {
    if (tradeState.idx1 === idx)      { tradeState.idx1 = tradeState.idx2; tradeState.idx2 = null; }
    else if (tradeState.idx2 === idx) { tradeState.idx2 = null; }
    else if (tradeState.idx1 === null){ tradeState.idx1 = idx; }
    else if (tradeState.idx2 === null){ tradeState.idx2 = idx; }
    else { tradeState.idx1 = tradeState.idx2; tradeState.idx2 = idx; }
    refreshModal(buildTradeModal);
  }

  function executeTrade() {
    if (tradeState.idx1 === null || tradeState.idx2 === null) return;
    var n1 = currentGame.players[tradeState.idx1].name;
    var n2 = currentGame.players[tradeState.idx2].name;
    closeModal();
    var result = Game.recordTrade(currentGame, tradeState.idx1, tradeState.idx2);
    toast('🔄 ' + n1 + ' ⇄ ' + n2);
    applyAction(result);
  }

  // ── End Game ────────────────────────────────────────────────────────────────
  function confirmForceEnd() {
    if (currentGame.finished) { finishGame(); return; }

    var alive = Game.alivePlayers(currentGame);

    if (alive.length <= 1) {
      var result = Game.forceEnd(currentGame);
      undoStack.push(result.snapshot);
      currentGame = result.game;
      saveGameState();
      finishGame();
      return;
    }

    // Multiple alive – show confirmation
    var rows = '';
    var sorted = [].concat(alive).sort(function(a, b) { return b.score - a.score; });
    var medals = ['🥇','🥈','🥉'];
    for (var i = 0; i < Math.min(sorted.length, 5); i++) {
      rows += '<div class="preview-row"><span>' + (medals[i] || (i+1)) + ' ' + esc(sorted[i].name) + '</span><span>' + sorted[i].score + ' pts</span></div>';
    }

    openModal(function() {
      return '<div class="modal-title">🏁 End Game?</div>' +
        '<div class="modal-sub">' + alive.length + ' players still alive.<br>Highest score wins with +3 bonus.</div>' +
        '<div class="preview-box">' + rows + '</div>' +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" onclick="App.closeModal()">Keep Playing</button>' +
        '<button class="btn btn-danger" onclick="App.forceEndGame()">End Game</button>' +
        '</div>';
    });
  }

  function forceEndGame() {
    closeModal();
    var result = Game.forceEnd(currentGame);
    undoStack.push(result.snapshot);
    currentGame = result.game;
    saveGameState();
    finishGame();
  }

  /**
   * finishGame – THE single function that ends a game.
   * Saves to history, updates leaderboard, navigates to leaderboard view.
   */
  var _finishedGameId = null;

  function finishGame() {
    if (!currentGame) return;
    if (_finishedGameId === currentGame.id) {
      // Already processed this game – just navigate
      showLeaderboard();
      return;
    }
    _finishedGameId = currentGame.id;

    var summary = Game.buildSummary(currentGame);
    lastGamePlayers = currentGame.players.map(function(p) { return p.name; });

    // Persist
    updateLeaderboard(summary);
    Storage.addToHistory(summary);
    Storage.clearCurrentGame();

    // Store result so leaderboard view can show the winner banner
    lastGameResult = {
      winner: currentGame.winner,
      isPerfectWin: currentGame.isPerfectWin,
      players: currentGame.players.slice().sort(function(a, b) { return b.score - a.score; }),
    };

    // Show leaderboard
    renderLeaderboard();
    showView('leaderboard');
  }

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  function updateLeaderboard(summary) {
    var lb = Storage.getLeaderboard();
    for (var i = 0; i < summary.players.length; i++) {
      var p = summary.players[i];
      if (!lb[p.name]) {
        lb[p.name] = { totalPoints: 0, gamesPlayed: 0, wins: 0, perfectWins: 0, totalKills: 0, totalDeaths: 0, bestStreak: 0 };
      }
      var e = lb[p.name];
      e.gamesPlayed += 1;
      e.totalPoints += p.score;
      e.totalKills  += p.kills;
      e.totalDeaths += p.deaths;
      e.bestStreak   = Math.max(e.bestStreak, p.maxStreak);
      if (p.name === summary.winner) {
        e.wins += 1;
        if (summary.isPerfectWin) e.perfectWins += 1;
      }
    }
    Storage.saveLeaderboard(lb);
  }

  function sortLeaderboard(key, btn) {
    lbSortKey = key;
    document.querySelectorAll('.sort-btn').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderLeaderboard();
  }

  function renderLeaderboard() {
    var container  = document.getElementById('leaderboard-content');
    var lb         = Storage.getLeaderboard();
    var entries    = [];

    var keys = Object.keys(lb);
    for (var i = 0; i < keys.length; i++) {
      var name = keys[i];
      var e = lb[name];
      var avg = e.gamesPlayed > 0 ? (e.totalPoints / e.gamesPlayed) : 0;
      var kd  = e.totalDeaths > 0 ? (e.totalKills / e.totalDeaths)  : e.totalKills;
      entries.push({
        name: name,
        totalPoints: e.totalPoints,
        gamesPlayed: e.gamesPlayed,
        wins: e.wins,
        perfectWins: e.perfectWins,
        totalKills: e.totalKills,
        totalDeaths: e.totalDeaths,
        bestStreak: e.bestStreak,
        avgPoints: avg,
        kd: kd,
      });
    }

    // Sort
    entries.sort(function(a, b) {
      if (lbSortKey === 'avgPoints') return b.avgPoints - a.avgPoints;
      return (b[lbSortKey] || 0) - (a[lbSortKey] || 0);
    });

    var html = '';

    // ── Winner banner (only shown when coming from a finished game) ──
    if (lastGameResult) {
      if (lastGameResult.winner) {
        html += '<div class="winner-card">';
        html += '<div class="winner-label">Game Over!</div>';
        html += '<div class="winner-name">🏆 ' + esc(lastGameResult.winner) + '</div>';
        if (lastGameResult.isPerfectWin) {
          html += '<div class="perfect-badge">✨ Perfect Win!</div>';
        }
        html += '</div>';
      } else {
        html += '<div class="winner-card"><div class="winner-label">Game Over!</div><div class="winner-name" style="font-size:1.3rem">🤝 Draw!</div></div>';
      }

      // Show this-game results
      html += '<div class="card"><h3>This Game</h3><div class="results-list">';
      var medals = ['🥇','🥈','🥉'];
      var gp = lastGameResult.players;
      for (var i = 0; i < gp.length; i++) {
        html += '<div class="result-row">';
        html += '<div class="result-rank">' + (medals[i] || (i + 1)) + '</div>';
        html += '<div><div class="result-name">' + esc(gp[i].name) + '</div>';
        html += '<div class="result-stats">K:' + gp[i].kills + ' D:' + gp[i].deaths + ' | Streak:' + gp[i].maxStreak + '</div></div>';
        html += '<div class="result-score">' + gp[i].score + '</div>';
        html += '</div>';
      }
      html += '</div></div>';

      // Rematch / Home buttons
      html += '<div class="summary-actions">';
      html += '<button class="btn btn-primary" onclick="App.rematch()">🔄 Rematch</button>';
      html += '<button class="btn btn-secondary" onclick="App.showHome()">🏠 Home</button>';
      html += '</div>';
    }

    // ── Sort row ──
    html += '<div class="sort-row">';
    html += '<span class="sort-label">Sort by:</span>';
    html += '<button class="sort-btn ' + (lbSortKey === 'totalPoints' ? 'active' : '') + '" onclick="App.sortLeaderboard(\'totalPoints\',this)">Points</button>';
    html += '<button class="sort-btn ' + (lbSortKey === 'wins' ? 'active' : '') + '" onclick="App.sortLeaderboard(\'wins\',this)">Wins</button>';
    html += '<button class="sort-btn ' + (lbSortKey === 'avgPoints' ? 'active' : '') + '" onclick="App.sortLeaderboard(\'avgPoints\',this)">Avg PPG</button>';
    html += '</div>';

    // ── Leaderboard cards ──
    if (entries.length === 0) {
      html += '<div class="empty-state"><p>No games played yet!</p></div>';
    } else {
      html += '<h3 class="lb-section-title">All-Time Leaderboard</h3>';
      var rankColors = ['gold', 'silver', 'bronze'];
      var rankMedals = ['🥇','🥈','🥉'];

      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var rc = rankColors[i] || '';
        var rm = rankMedals[i] || (i + 1);
        var kd = e.kd.toFixed(2);
        var avg = e.avgPoints.toFixed(1);

        html += '<div class="lb-card' + (i === 0 ? ' lb-card-first' : '') + '">';
        html += '<div class="lb-card-header">';
        html += '<span class="lb-card-rank ' + rc + '">' + rm + '</span>';
        html += '<span class="lb-card-name">' + esc(e.name) + '</span>';
        html += '<span class="lb-card-pts">' + e.totalPoints + ' pts</span>';
        html += '</div>';
        html += '<div class="lb-card-stats">';
        html += '<div class="lb-stat"><span class="lb-stat-label">Games</span><span class="lb-stat-value">' + e.gamesPlayed + '</span></div>';
        html += '<div class="lb-stat"><span class="lb-stat-label">Wins</span><span class="lb-stat-value">' + e.wins + (e.perfectWins ? ' (' + e.perfectWins + '✨)' : '') + '</span></div>';
        html += '<div class="lb-stat"><span class="lb-stat-label">Kills</span><span class="lb-stat-value">' + e.totalKills + '</span></div>';
        html += '<div class="lb-stat"><span class="lb-stat-label">Deaths</span><span class="lb-stat-value">' + e.totalDeaths + '</span></div>';
        html += '<div class="lb-stat"><span class="lb-stat-label">K/D</span><span class="lb-stat-value">' + kd + '</span></div>';
        html += '<div class="lb-stat"><span class="lb-stat-label">Best Streak</span><span class="lb-stat-value">' + e.bestStreak + '</span></div>';
        html += '<div class="lb-stat"><span class="lb-stat-label">Avg PPG</span><span class="lb-stat-value">' + avg + '</span></div>';
        html += '<div class="lb-stat"><span class="lb-stat-label">Perfect Wins</span><span class="lb-stat-value">' + e.perfectWins + '</span></div>';
        html += '</div></div>';
      }
    }

    container.innerHTML = html;
  }

  function resetLeaderboard() {
    openModal(function() {
      return '<div class="modal-title">Reset Leaderboard?</div>' +
        '<div class="modal-sub">All stats permanently deleted. History kept.</div>' +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>' +
        '<button class="btn btn-danger" onclick="App.doResetLeaderboard()">Reset</button>' +
        '</div>';
    }, true);
  }

  function doResetLeaderboard() {
    Storage.resetLeaderboard();
    closeModal();
    renderLeaderboard();
    toast('Leaderboard reset', 'danger');
  }

  // ── Match History ───────────────────────────────────────────────────────────
  function renderHistory() {
    var history = Storage.getHistory();
    var list    = document.getElementById('history-list');
    var empty   = document.getElementById('history-empty');

    if (history.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    var html = '';
    for (var m = 0; m < history.length; m++) {
      var match   = history[m];
      var date    = new Date(match.finishedAt || match.startedAt);
      var dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      var timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      var sorted  = [].concat(match.players).sort(function(a, b) { return b.score - a.score; });
      var names   = match.players.map(function(p) { return esc(p.name); }).join(' · ');
      var winText = match.winner
        ? 'Winner: <strong>' + esc(match.winner) + '</strong>' + (match.isPerfectWin ? ' ✨ Perfect' : '')
        : 'Result: Draw';

      html += '<div class="history-item" id="hist-' + match.id + '">';
      html += '<div class="history-item-top"><div>';
      html += '<div class="history-date">' + dateStr + ' · ' + timeStr + '</div>';
      html += '<div class="history-winner">' + winText + '</div>';
      html += '</div>';
      html += '<button class="history-delete" title="Delete" onclick="App.deleteMatch(\'' + match.id + '\')">🗑</button>';
      html += '</div>';
      html += '<div class="history-players">' + names + '</div>';
      html += '<div class="history-toggle" onclick="App.toggleHistory(\'' + match.id + '\')">▼ Show scores</div>';
      html += '<div class="history-expand">';
      var medals = ['🥇','🥈','🥉'];
      for (var i = 0; i < sorted.length; i++) {
        html += '<div class="history-expand-row">';
        html += '<span class="hname">' + (medals[i] || '  ') + ' ' + esc(sorted[i].name) + '</span>';
        html += '<span>' + sorted[i].kills + 'K ' + sorted[i].deaths + 'D</span>';
        html += '<span class="hscore">' + sorted[i].score + ' pts</span>';
        html += '</div>';
      }
      html += '</div></div>';
    }
    list.innerHTML = html;
  }

  function toggleHistory(id) {
    var item = document.getElementById('hist-' + id);
    if (!item) return;
    var expanded = item.classList.toggle('expanded');
    var toggle = item.querySelector('.history-toggle');
    if (toggle) toggle.textContent = expanded ? '▲ Hide scores' : '▼ Show scores';
  }

  function deleteMatch(id) {
    openModal(function() {
      return '<div class="modal-title">Delete Match?</div>' +
        '<div class="modal-sub">This match will be removed from history.</div>' +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>' +
        '<button class="btn btn-danger" onclick="App.doDeleteMatch(\'' + id + '\')">Delete</button>' +
        '</div>';
    }, true);
  }

  function doDeleteMatch(id) {
    Storage.deleteFromHistory(id);
    closeModal();
    renderHistory();
    toast('Match deleted', 'danger');
  }

  function clearHistory() {
    openModal(function() {
      return '<div class="modal-title">Clear All History?</div>' +
        '<div class="modal-sub">All match records permanently deleted.</div>' +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>' +
        '<button class="btn btn-danger" onclick="App.doClearHistory()">Clear All</button>' +
        '</div>';
    }, true);
  }

  function doClearHistory() {
    Storage.clearHistory();
    closeModal();
    renderHistory();
    toast('History cleared', 'danger');
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  function exportData() {
    var data = {
      exportedAt: new Date().toISOString(),
      leaderboard: Storage.getLeaderboard(),
      history: Storage.getHistory(),
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'gbst-export-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Data exported!');
  }

  // ── Modal ───────────────────────────────────────────────────────────────────
  function openModal(renderFn, centered) {
    var overlay = document.getElementById('modal-overlay');
    overlay.classList.toggle('top', !!centered);
    overlay.classList.remove('hidden');
    var result = renderFn();
    document.getElementById('modal-content').innerHTML = result || '';
    overlay._renderFn = renderFn;
  }

  function refreshModal(renderFn) {
    var overlay = document.getElementById('modal-overlay');
    overlay._renderFn = renderFn;
    var result = renderFn();
    document.getElementById('modal-content').innerHTML = result || '';
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-content').innerHTML = '';
  }

  function closeModalOutside(event) {
    if (event.target === document.getElementById('modal-overlay')) closeModal();
  }

  // ── Toast ───────────────────────────────────────────────────────────────────
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(function() { el.remove(); }, 2400);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function esc(str) {
    var d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  return {
    showHome: showHome,
    showNewGame: showNewGame,
    showLeaderboard: showLeaderboard,
    showHistory: showHistory,
    showRules: showRules,
    goHomeFromGame: goHomeFromGame,
    toggleDarkMode: toggleDarkMode,
    addPlayer: addPlayer,
    removePlayer: removePlayer,
    addSavedPlayer: addSavedPlayer,
    startGame: startGame,
    resumeGame: resumeGame,
    rematch: rematch,
    undoAction: undoAction,
    startKillAction: startKillAction,
    killStep1: killStep1,
    killSelectKiller: killSelectKiller,
    killSelectVictim: killSelectVictim,
    executeKill: executeKill,
    startTradeAction: startTradeAction,
    tradeToggle: tradeToggle,
    executeTrade: executeTrade,
    confirmForceEnd: confirmForceEnd,
    forceEndGame: forceEndGame,
    sortLeaderboard: sortLeaderboard,
    resetLeaderboard: resetLeaderboard,
    doResetLeaderboard: doResetLeaderboard,
    toggleHistory: toggleHistory,
    deleteMatch: deleteMatch,
    doDeleteMatch: doDeleteMatch,
    clearHistory: clearHistory,
    doClearHistory: doClearHistory,
    exportData: exportData,
    closeModal: closeModal,
    closeModalOutside: closeModalOutside,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', function() {
  window.App = App;
  var dark;
  try { var v = localStorage.getItem('gbst_dark_mode'); dark = v ? JSON.parse(v) : true; } catch(e) { dark = true; }
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  App.showHome();
});
