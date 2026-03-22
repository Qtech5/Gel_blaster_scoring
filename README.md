# Gel Blaster Score Tracker

A mobile-friendly single-page app for tracking FFA gel blaster games.

## Running Locally

**Option 1 – Direct open (simplest):**
```
open index.html
```
Just double-click `index.html` in Finder, or drag it into any browser.

**Option 2 – Local server (avoids any browser quirks):**
```bash
cd gel-blaster-tracker
python3 -m http.server 8080
# then open http://localhost:8080
```
Or with Node:
```bash
npx serve .
```

## Project Structure

```
gel-blaster-tracker/
├── index.html        # All views (home, game, leaderboard, history, rules)
├── css/
│   └── styles.css    # Dark-first, mobile-first styles + light mode toggle
├── js/
│   ├── storage.js    # localStorage wrapper (players, leaderboard, history, game)
│   ├── game.js       # Pure FFA scoring logic — no DOM, fully testable
│   └── app.js        # App state, routing, rendering, event handlers
└── README.md
```

## Data Persistence

All data is stored in `localStorage` under the `gbst_` prefix:

| Key | Contents |
|-----|----------|
| `gbst_players` | Known player names (for quick-add) |
| `gbst_leaderboard` | Cross-game stats per player |
| `gbst_history` | Completed match records |
| `gbst_current_game` | In-progress game + undo stack |
| `gbst_dark_mode` | Theme preference |

## Adding a New Game Mode

1. Add a new mode button in `index.html` (mode-select section)
2. Add scoring logic in `game.js` (mirror the `ffa` functions)
3. Branch on `game.mode` in `app.js` where needed

## FFA Rules Summary

- 2 lives each; lose both = eliminated
- Kill streak resets every time you lose a life
- Kill points: 1st kill = +1, 2nd = +2, 3rd = +3, …
- Each life lost = −1 point to the victim
- Trade (simultaneous hit): both get kill credit at their next streak level, then both lose a life
- Last alive: +3 win bonus; last alive with both lives untouched: +8 (not stacking with +3)
