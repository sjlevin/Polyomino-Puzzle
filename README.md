# Polyomino Puzzle

A browser-based polyomino puzzle game where you fill shapes with pieces to earn points.

## Play Online

**https://sjlevin.github.io/Polyomino-Puzzle/**

## Run Locally

Open `index.html` in a browser, or start a local server:

```bash
python3 -m http.server 8000
# Visit http://localhost:8000
```

## How to Play

### Goal
Earn points by completing puzzles. Build up your piece collection with Tier 1 puzzles, then use those pieces to solve Tier 2 puzzles for points.

### Controls
- **Drag** pieces onto puzzles to place them
- **Click** a piece to rotate 90°
- **Right-click** a piece to mirror/flip

### Puzzle Tiers

**Tier 1 (top row)** - Earn Pieces
- Small puzzles (1-5 cells)
- Reward: A new polyomino piece
- No points awarded

**Tier 2 (bottom row)** - Earn Points  
- Large puzzles (6-14 cells)
- Reward: Points based on puzzle size
- No pieces awarded

### Timer System
Each puzzle has a countdown timer (pie chart). Every time you place a piece on ANY puzzle, all timers tick down by 1. If a timer reaches 0:
- The puzzle expires and is replaced
- Any pieces you placed on it are refunded
- Expired puzzles are tracked in your stats

Timer colors:
- 🟢 Green: >60% remaining
- 🟡 Yellow: 30-59% remaining
- 🔴 Red: <30% remaining

### Pieces
9 polyomino types across 4 levels:
- Level 1: Dot (1 cell)
- Level 2: Domino (2 cells)
- Level 3: Tromino I, Tromino L (3 cells)
- Level 4: Tetro I, O, T, S, L (4 cells)

### Scoring
- Points come only from completing Tier 2 puzzles
- Track your efficiency with Points/Turn ratio
- Stats show solved vs expired puzzles per tier

## Project Structure

```
polyomino-puzzle/
├── index.html          # Main HTML file
├── style.css           # Styling
├── game.js             # Game logic
├── puzzles.js          # Auto-generated puzzle definitions
├── generate-puzzles.js # Puzzle generator script
├── validate-puzzles.js # Duplicate checker script
└── README.md           # This file
```

## Development

### Regenerate Puzzles

```bash
node generate-puzzles.js
```

Generates new random puzzles for both tiers and writes to `puzzles.js`. All puzzles are guaranteed unique (no rotational or mirror duplicates).

### Validate Puzzles

```bash
node validate-puzzles.js
```

Checks `puzzles.js` for any duplicate puzzles (accounting for rotation and mirroring). Exits with error code 1 if duplicates found.

### Run Tests

```bash
node test.js
```

Runs unit tests for core game logic (rotation, placement, snap-to-grid). Exits with error code 1 if any tests fail.

### Puzzle Format

Puzzles are defined as grids where `1` = empty cell to fill, `0` = blocked:

```javascript
{ 
    grid: [[1,1,1],[0,1,0]],  // T-shape
    points: 0,                // 0 for tier 1
    reward: 'tromino_i'       // piece type or null for tier 2
}
```

### Adding Custom Puzzles

1. Edit `puzzles.js` directly, or
2. Modify `generate-puzzles.js` parameters and regenerate
3. Run `node validate-puzzles.js` to check for duplicates

## Game Constants

In `game.js`:
- `TIER1_TURNS = 8` - Timer for tier 1 puzzles
- `TIER2_TURNS = 12` - Timer for tier 2 puzzles
- Starting pieces: 1 dot, 1 domino
- 4 puzzles displayed per tier
