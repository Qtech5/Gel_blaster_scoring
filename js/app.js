/**
 * App – application state, routing, event handling, and rendering.
 *
 * Depends on: storage.js, game.js
 */
const App = (() => {

  // ── App State ────────────────────────────────────────────────────────────────
  let currentView       = 'home';
  let currentGame       = null;   // live game state object
  let undoStack         = [];     // array of snapshots (game states before each action)
  let newGamePlayers    = [];     // player names being built for a new game
  let lastGamePlayers   = [];     // for rematch
  let lbSortKey         = 'totalPoints';

  // Kill / trade modal state
  let killState  = { phase: 0, killerIdx: null, victimIdx: null };
  let tradeState = { idx1: null, idx2: null };

  const MAX_UNDO = 30;

  // ── Routing ──────────────────────────────────────────────────────────────────
  function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + id).classList.add('active');
    currentView = id;
    window.scrollTo(0, 0);
  }

  function showHome() {
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
    setTimeout(() => document.getElementById('player-name-input').focus(), 300);
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

  function goHomeFromGame() {
    // Game is auto-saved on every action; just go home
    showHome();
  }

  // ── Dark Mode ────────────────────────────────────────────────────────────────
  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  function toggleDarkMode() {
    const dark = !Storage.getDarkMode();
    Storage.saveDarkMode(dark);
    applyTheme(dark);
  }

  // ── New Game Setup ────────────────────────────────────────────────────────────
  function addPlayer() {
    const input = document.getElementById('player-name-input');
    const name  = input.value.trim();
    if (!name) return;
    if (newGamePlayers.includes(name)) { toast('Already added!'); return; }
    if (newGamePlayers.length >= 20)   { toast('Max 20 players'); return; }

    newGamePlayers.push(name);
    // Save to known players list
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
    if (newGamePlayers.includes(name)) { toast(`${name} already added`); return; }
    newGamePlayers.push(name);
    renderPlayerList();
  }

  function renderPlayerList() {
    const list = document.getElementById('player-list');
    const msg  = document.getElementById('player-count-msg');
    const btn  = document.getElementById('start-game-btn');

    list.innerHTML = newGamePlayers.map((name, i) => `
      <div class="player-list-item">
        <span>${esc(name)}</span>
        <button class="remove-player-btn" onclick="App.removePlayer(${i})">✕</button>
      </div>
    `).join('');

    const n = newGamePlayers.length;
    msg.textContent = n === 0 ? 'Add at least 2 players to start'
                    : n === 1 ? 'Add at least 1 more player'
                    : `${n} players ready`;
    btn.disabled = n < 2;
  }

  function renderSavedPlayers() {
    const saved = Storage.getSavedPlayers();
    const row   = document.getElementById('saved-players-row');
    const list  = document.getElementById('saved-players-list');

    if (saved.length === 0) { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');
    list.innerHTML = saved.map(name => `
      <button class="saved-player-chip" onclick="App.addSavedPlayer('${esc(name)}')">${esc(name)}</button>
    `).join('');
  }

  function startGame() {
    if (newGamePlayers.length < 2) return;
    lastGamePlayers = [...newGamePlayers];
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
    newGamePlayers = [...lastGamePlayers];
    currentGame = Game.create(newGamePlayers);
    undoStack = [];
    saveGameState();
    renderGame();
    showView('game');
  }

  // ── Live Game – Save & Render ─────────────────────────────────────────────────
  function saveGameState() {
    Storage.saveCurrentGame({ game: currentGame, undoStack });
  }

  function renderGame() {
    const grid = document.getElementById('game-players-grid');
    const players = currentGame.players;

    // Determine leader (highest score among alive)
    const alive = players.filter(p => !p.isOut);
    let leaderIdx = -1;
    if (alive.length > 0) {
      const maxScore = Math.max(...alive.map(p => p.score));
      const leader = alive.find(p => p.score === maxScore);
      if (leader) leaderIdx = players.indexOf(leader);
    }

    grid.innerHTML = players.map((p, i) => {
      const isLeader = (i === leaderIdx && alive.length > 1);
      const lives = '♥'.repeat(p.lives) + '♡'.repeat(2 - p.lives);
      const streakHot = p.streak >= 3;
      return `
        <div class="player-card ${p.isOut ? 'out' : ''} ${isLeader ? 'leader' : ''}">
          ${isLeader ? '<div class="leader-crown">👑</div>' : ''}
          ${p.isOut  ? '<div class="out-badge">OUT</div>' : ''}
          <div class="player-card-top">
            <div class="player-name">${esc(p.name)}</div>
            <div class="player-lives" title="${p.lives} lives remaining">${lives}</div>
          </div>
          <div class="player-card-bottom">
            <div>
              <div class="player-score-val">${p.score} pts</div>
            </div>
            <span class="streak-badge ${streakHot ? 'hot' : ''}">🔥 ${p.streak}</span>
            <div class="player-kd">K:${p.kills} D:${p.deaths}</div>
          </div>
        </div>
      `;
    }).join('');

    // Disable undo button if nothing to undo
    const undoBtn = document.querySelector('#view-game .btn-ghost');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  function undoAction() {
    if (undoStack.length === 0) { toast('Nothing to undo'); return; }
    currentGame = undoStack.pop();
    saveGameState();
    renderGame();
    toast('Undone ↩');
  }

  function pushUndo(snapshot) {
    undoStack.push(snapshot);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function applyAction(result) {
    pushUndo(result.snapshot);
    currentGame = result.game;
    saveGameState();
    renderGame();

    if (currentGame.finished) {
      // Short delay so the final kill/OUT badge is visible before summary appears
      setTimeout(endGame, 350);
    }
  }

  // ── Kill Modal ────────────────────────────────────────────────────────────────
  function startKillAction() {
    killState = { phase: 1, killerIdx: null, victimIdx: null };
    openModal(renderKillModal);
  }

  function renderKillModal() {
    const alive = Game.alivePlayers(currentGame);
    if (alive.length < 2) { closeModal(); toast('Need 2+ alive players'); return; }

    const phase = killState.phase;

    if (phase === 1) {
      return `
        <div class="modal-title">⚔️ Who got the kill?</div>
        <div class="modal-sub">Select the killer</div>
        <div class="player-select-grid">
          ${alive.map(p => `
            <button class="player-select-btn" onclick="App.killSelectKiller(${p.index})">
              ${esc(p.name)}
              <span class="psbsub">Streak: ${p.streak} → next +${p.streak + 1}</span>
            </button>
          `).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
        </div>
      `;
    }

    if (phase === 2) {
      const killer = currentGame.players[killState.killerIdx];
      return `
        <div class="modal-title">⚔️ ${esc(killer.name)} eliminated…</div>
        <div class="modal-sub">Select the victim</div>
        <div class="player-select-grid">
          ${alive
            .filter(p => p.index !== killState.killerIdx)
            .map(p => `
              <button class="player-select-btn ${killState.victimIdx === p.index ? 'selected' : ''}"
                      onclick="App.killSelectVictim(${p.index})">
                ${esc(p.name)}
                <span class="psbsub">${'♥'.repeat(p.lives)} ${p.lives} life(ves)</span>
              </button>
            `).join('')}
        </div>
        ${killState.victimIdx !== null ? renderKillPreview() : ''}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="App.killStep1()">← Back</button>
          <button class="btn btn-primary" id="confirm-kill-btn"
                  onclick="App.executeKill()"
                  ${killState.victimIdx === null ? 'disabled' : ''}>
            Confirm Kill
          </button>
        </div>
      `;
    }
  }

  function renderKillPreview() {
    if (killState.victimIdx === null) return '';
    const p = Game.previewKill(currentGame, killState.killerIdx, killState.victimIdx);
    return `
      <div class="preview-box">
        <div class="preview-row">
          <span>⚔️ ${esc(p.killerName)}</span>
          <span class="preview-pos">+${p.killPts} pts</span>
        </div>
        <div class="preview-row">
          <span>💀 ${esc(p.victimName)}</span>
          <span class="preview-neg">−1 pt, −1 life</span>
        </div>
        ${p.victimEliminated ? `<div class="preview-elim">🔴 ${esc(p.victimName)} is eliminated!</div>` : ''}
      </div>
    `;
  }

  function killStep1() {
    killState.phase = 1;
    killState.killerIdx = null;
    killState.victimIdx = null;
    refreshModal(renderKillModal);
  }

  function killSelectKiller(idx) {
    killState.killerIdx = idx;
    killState.phase = 2;
    killState.victimIdx = null;
    refreshModal(renderKillModal);
  }

  function killSelectVictim(idx) {
    killState.victimIdx = idx;
    refreshModal(renderKillModal);
  }

  function executeKill() {
    if (killState.killerIdx === null || killState.victimIdx === null) return;
    closeModal();
    const result = Game.recordKill(currentGame, killState.killerIdx, killState.victimIdx);
    const killer = currentGame.players[killState.killerIdx].name;
    const victim  = currentGame.players[killState.victimIdx].name;
    toast(`⚔️ ${killer} eliminated ${victim}`);
    applyAction(result);
  }

  // ── Trade Modal ───────────────────────────────────────────────────────────────
  function startTradeAction() {
    tradeState = { idx1: null, idx2: null };
    openModal(renderTradeModal);
  }

  function renderTradeModal() {
    const alive = Game.alivePlayers(currentGame);
    if (alive.length < 2) { closeModal(); toast('Need 2+ alive players'); return; }

    const bothSelected = tradeState.idx1 !== null && tradeState.idx2 !== null;

    return `
      <div class="modal-title">🔄 Trade – Select 2 Players</div>
      <div class="modal-sub">Both hit each other simultaneously</div>
      <div class="player-select-grid">
        ${alive.map(p => {
          const sel = p.index === tradeState.idx1 || p.index === tradeState.idx2;
          return `
            <button class="player-select-btn ${sel ? 'selected' : ''}"
                    onclick="App.tradeToggle(${p.index})">
              ${esc(p.name)}
              <span class="psbsub">Streak: ${p.streak} → +${p.streak + 1}</span>
            </button>
          `;
        }).join('')}
      </div>
      ${bothSelected ? renderTradePreview() : ''}
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-warning" onclick="App.executeTrade()" ${bothSelected ? '' : 'disabled'}>
          Confirm Trade
        </button>
      </div>
    `;
  }

  function renderTradePreview() {
    if (tradeState.idx1 === null || tradeState.idx2 === null) return '';
    const p = Game.previewTrade(currentGame, tradeState.idx1, tradeState.idx2);
    function row(side) {
      return `
        <div class="preview-row">
          <span>🔄 ${esc(side.name)}</span>
          <span class="${side.net >= 0 ? 'preview-pos' : 'preview-neg'}">
            +${side.killPts} kill, −1 life = ${side.net >= 0 ? '+' : ''}${side.net}
          </span>
        </div>
        ${side.eliminated ? `<div class="preview-elim">🔴 ${esc(side.name)} is eliminated!</div>` : ''}
      `;
    }
    return `<div class="preview-box">${row(p.p1)}${row(p.p2)}</div>`;
  }

  function tradeToggle(idx) {
    if (tradeState.idx1 === idx) { tradeState.idx1 = tradeState.idx2; tradeState.idx2 = null; }
    else if (tradeState.idx2 === idx) { tradeState.idx2 = null; }
    else if (tradeState.idx1 === null) { tradeState.idx1 = idx; }
    else if (tradeState.idx2 === null) { tradeState.idx2 = idx; }
    else { tradeState.idx1 = tradeState.idx2; tradeState.idx2 = idx; } // replace oldest
    refreshModal(renderTradeModal);
  }

  function executeTrade() {
    if (tradeState.idx1 === null || tradeState.idx2 === null) return;
    closeModal();
    const p1 = currentGame.players[tradeState.idx1].name;
    const p2 = currentGame.players[tradeState.idx2].name;
    const result = Game.recordTrade(currentGame, tradeState.idx1, tradeState.idx2);
    toast(`🔄 Trade: ${p1} ⇄ ${p2}`);
    applyAction(result);
  }

  // ── Force End ─────────────────────────────────────────────────────────────────
  function confirmForceEnd() {
    // If the game already finished naturally (auto-end timer pending), go straight to summary
    if (currentGame.finished) {
      endGame();
      return;
    }

    const alive = Game.alivePlayers(currentGame);

    if (alive.length <= 1) {
      // One (or zero) alive — end naturally without a modal
      const result = Game.forceEnd(currentGame);
      pushUndo(result.snapshot);
      currentGame = result.game;
      saveGameState();
      endGame();
      return;
    }

    // Multiple players still alive — ask for confirmation
    openModal(() => `
      <div class="modal-title">🏁 End Game?</div>
      <div class="modal-sub">
        ${alive.length} players still alive.<br>
        Highest score wins with +3 bonus.
      </div>
      <div class="preview-box">
        ${[...alive].sort((a,b) => b.score - a.score).slice(0,3).map((p,i) =>
          `<div class="preview-row"><span>${i===0?'🥇':i===1?'🥈':'🥉'} ${esc(p.name)}</span><span>${p.score} pts</span></div>`
        ).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost"  onclick="App.closeModal()">Keep Playing</button>
        <button class="btn btn-danger" onclick="App.forceEndGame()">End Game</button>
      </div>
    `);
  }

  function forceEndGame() {
    closeModal();
    const result = Game.forceEnd(currentGame);
    pushUndo(result.snapshot);
    currentGame = result.game;
    saveGameState();
    // Navigate to summary immediately — no timer
    endGame();
  }

  // ── End Game / Summary ────────────────────────────────────────────────────────
  let _lastEndedGameId = null; // prevents double-recording if auto-end and manual end race

  function endGame() {
    if (!currentGame || _lastEndedGameId === currentGame.id) return;
    _lastEndedGameId = currentGame.id;

    const summary = Game.buildSummary(currentGame);
    lastGamePlayers = currentGame.players.map(p => p.name);

    // Update persistent leaderboard
    updateLeaderboard(summary);
    // Save to history
    Storage.addToHistory(summary);
    // Clear in-progress game
    Storage.clearCurrentGame();

    renderSummary(currentGame, summary);
    showView('summary');
  }

  function renderSummary(game, summary) {
    const winnerCard = document.getElementById('summary-winner-card');
    const results    = document.getElementById('summary-results');

    if (game.winner) {
      const winner = game.players.find(p => p.name === game.winner);
      winnerCard.innerHTML = `
        <div class="winner-label">Winner</div>
        <div class="winner-name">🏆 ${esc(game.winner)}</div>
        <div class="winner-sub">${winner ? winner.score + ' points' : ''}</div>
        ${game.isPerfectWin ? '<div class="perfect-badge">✨ Perfect Win!</div>' : ''}
      `;
    } else {
      winnerCard.innerHTML = `
        <div class="winner-label">Result</div>
        <div class="winner-name" style="font-size:1.3rem">🤝 Draw!</div>
        <div class="winner-sub">All players eliminated simultaneously</div>
      `;
    }

    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    const rankEmoji = ['🥇','🥈','🥉'];
    results.innerHTML = sorted.map((p, i) => `
      <div class="result-row">
        <div class="result-rank">${rankEmoji[i] || (i + 1)}</div>
        <div>
          <div class="result-name">${esc(p.name)}</div>
          <div class="result-stats">K: ${p.kills} | D: ${p.deaths} | Best streak: ${p.maxStreak}</div>
        </div>
        <div class="result-score">${p.score}</div>
      </div>
    `).join('');
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────────
  function updateLeaderboard(summary) {
    const lb = Storage.getLeaderboard();
    summary.players.forEach(p => {
      if (!lb[p.name]) lb[p.name] = { totalPoints:0, gamesPlayed:0, wins:0, perfectWins:0, totalKills:0, totalDeaths:0, bestStreak:0 };
      const e = lb[p.name];
      e.gamesPlayed += 1;
      e.totalPoints += p.score;
      e.totalKills  += p.kills;
      e.totalDeaths += p.deaths;
      e.bestStreak   = Math.max(e.bestStreak, p.maxStreak);
      if (p.name === summary.winner) {
        e.wins += 1;
        if (summary.isPerfectWin) e.perfectWins += 1;
      }
    });
    Storage.saveLeaderboard(lb);
  }

  function sortLeaderboard(key, btn) {
    lbSortKey = key;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderLeaderboard();
  }

  function renderLeaderboard() {
    const lb      = Storage.getLeaderboard();
    const table   = document.getElementById('leaderboard-table');
    const empty   = document.getElementById('leaderboard-empty');
    const entries = Object.entries(lb).map(([name, e]) => ({
      name, ...e,
      avgPoints: e.gamesPlayed > 0 ? (e.totalPoints / e.gamesPlayed) : 0,
    }));

    if (entries.length === 0) {
      table.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    entries.sort((a, b) => {
      if (lbSortKey === 'avgPoints') return b.avgPoints - a.avgPoints;
      return b[lbSortKey] - a[lbSortKey];
    });

    const rankClass = (i) => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const rankEmoji = (i) => ['🥇','🥈','🥉'][i] || (i + 1);

    table.innerHTML = entries.map((e, i) => {
      const avg = e.avgPoints.toFixed(1);
      return `
        <div class="lb-row">
          <div class="lb-rank ${rankClass(i)}">${rankEmoji(i)}</div>
          <div>
            <div class="lb-name">${esc(e.name)}</div>
            <div class="lb-sub">
              ${e.gamesPlayed}G · ${e.wins}W${e.perfectWins ? ` (${e.perfectWins} perfect)` : ''} · K:${e.totalKills} D:${e.totalDeaths} · Best streak: ${e.bestStreak}
            </div>
          </div>
          <div>
            <div class="lb-pts">${e.totalPoints}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);text-align:right">${avg} avg</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function resetLeaderboard() {
    openModal(() => `
      <div class="modal-title">Reset Leaderboard?</div>
      <div class="modal-sub">All leaderboard stats will be permanently deleted.<br>Match history is kept.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost"  onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="App.doResetLeaderboard()">Reset</button>
      </div>
    `, true);
  }
  function doResetLeaderboard() {
    Storage.resetLeaderboard();
    closeModal();
    renderLeaderboard();
    toast('Leaderboard reset', 'danger');
  }

  // ── Match History ─────────────────────────────────────────────────────────────
  function renderHistory() {
    const history = Storage.getHistory();
    const list    = document.getElementById('history-list');
    const empty   = document.getElementById('history-empty');

    if (history.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    list.innerHTML = history.map(m => {
      const date   = new Date(m.finishedAt || m.startedAt);
      const dateStr = date.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
      const timeStr = date.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
      const sorted  = [...m.players].sort((a,b) => b.score - a.score);

      return `
        <div class="history-item" id="hist-${m.id}">
          <div class="history-item-top">
            <div>
              <div class="history-date">${dateStr} · ${timeStr}</div>
              <div class="history-winner">
                ${m.winner
                  ? `Winner: <strong>${esc(m.winner)}</strong>${m.isPerfectWin ? ' ✨ Perfect' : ''}`
                  : 'Result: Draw'}
              </div>
            </div>
            <button class="history-delete" title="Delete" onclick="App.deleteMatch('${m.id}')">🗑</button>
          </div>
          <div class="history-players">${m.players.map(p => esc(p.name)).join(' · ')}</div>
          <div class="history-toggle" onclick="App.toggleHistory('${m.id}')">▼ Show scores</div>
          <div class="history-expand">
            ${sorted.map((p, i) => `
              <div class="history-expand-row">
                <span class="hname">${['🥇','🥈','🥉'][i] || '  '} ${esc(p.name)}</span>
                <span>${p.kills}K ${p.deaths}D</span>
                <span class="hscore">${p.score} pts</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function toggleHistory(id) {
    const item = document.getElementById('hist-' + id);
    if (!item) return;
    const expanded = item.classList.toggle('expanded');
    item.querySelector('.history-toggle').textContent = expanded ? '▲ Hide scores' : '▼ Show scores';
  }

  function deleteMatch(id) {
    openModal(() => `
      <div class="modal-title">Delete Match?</div>
      <div class="modal-sub">This match will be removed from history.<br>Leaderboard is not affected.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost"  onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="App.doDeleteMatch('${id}')">Delete</button>
      </div>
    `, true);
  }
  function doDeleteMatch(id) {
    Storage.deleteFromHistory(id);
    closeModal();
    renderHistory();
    toast('Match deleted', 'danger');
  }

  function clearHistory() {
    openModal(() => `
      <div class="modal-title">Clear All History?</div>
      <div class="modal-sub">All match records will be permanently deleted.<br>Leaderboard is not affected.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost"  onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="App.doClearHistory()">Clear All</button>
      </div>
    `, true);
  }
  function doClearHistory() {
    Storage.clearHistory();
    closeModal();
    renderHistory();
    toast('History cleared', 'danger');
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  function exportData() {
    const data = {
      exportedAt:  new Date().toISOString(),
      leaderboard: Storage.getLeaderboard(),
      history:     Storage.getHistory(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `gbst-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Data exported!');
  }

  // ── Modal ─────────────────────────────────────────────────────────────────────
  function openModal(renderFn, centered = false) {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');
    overlay.classList.toggle('top', centered);
    overlay.classList.remove('hidden');
    document.getElementById('modal-content').innerHTML = renderFn();
    // Store renderFn for refresh
    overlay._renderFn = renderFn;
  }

  function refreshModal(renderFn) {
    const overlay = document.getElementById('modal-overlay');
    overlay._renderFn = renderFn;
    document.getElementById('modal-content').innerHTML = renderFn();
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-content').innerHTML = '';
  }

  function closeModalOutside(event) {
    if (event.target === document.getElementById('modal-overlay')) closeModal();
  }

  // ── Toast ─────────────────────────────────────────────────────────────────────
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  function init() {
    applyTheme(Storage.getDarkMode());
    showHome();
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  return {
    // Navigation
    showHome, showNewGame, showLeaderboard, showHistory, showRules, goHomeFromGame,
    // Theme
    toggleDarkMode,
    // New game
    addPlayer, removePlayer, addSavedPlayer, startGame, resumeGame, rematch,
    // Live game
    undoAction,
    startKillAction, killStep1, killSelectKiller, killSelectVictim, executeKill,
    startTradeAction, tradeToggle, executeTrade,
    confirmForceEnd, forceEndGame,
    // Leaderboard
    sortLeaderboard, resetLeaderboard, doResetLeaderboard,
    // History
    toggleHistory, deleteMatch, doDeleteMatch, clearHistory, doClearHistory,
    // Export
    exportData,
    // Modal
    closeModal, closeModalOutside,
  };

})();

// Boot
document.addEventListener('DOMContentLoaded', () => {
  window.App = App;
  // Apply saved theme before first render to avoid flash
  const dark = (() => {
    try { const v = localStorage.getItem('gbst_dark_mode'); return v ? JSON.parse(v) : true; } catch { return true; }
  })();
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  App.showHome();
});
