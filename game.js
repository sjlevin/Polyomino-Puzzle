// Version marker for cache busting
const GAME_VERSION = '2024-01-24-v2';
console.log('Game version:', GAME_VERSION);

// Piece definitions: [shape grid, level]
const PIECES = {
    dot:    { shape: [[1]], level: 1 },
    domino: { shape: [[1,1]], level: 2 },
    tromino_i: { shape: [[1,1,1]], level: 3 },
    tromino_l: { shape: [[1,0],[1,1]], level: 3 },
    tetro_i: { shape: [[1,1,1,1]], level: 4 },
    tetro_l: { shape: [[1,0],[1,0],[1,1]], level: 4 },
    tetro_t: { shape: [[1,1,1],[0,1,0]], level: 4 },
    tetro_s: { shape: [[0,1,1],[1,1,0]], level: 4 },
    tetro_o: { shape: [[1,1],[1,1]], level: 4 },
    // Pentominoes (Level 5) - only available via sacrifice in Advanced Mode
    pento_f: { shape: [[0,1,1],[1,1,0],[0,1,0]], level: 5 },
    pento_i: { shape: [[1,1,1,1,1]], level: 5 },
    pento_l: { shape: [[1,0],[1,0],[1,0],[1,1]], level: 5 },
    pento_n: { shape: [[0,1],[1,1],[1,0],[1,0]], level: 5 },
    pento_p: { shape: [[1,1],[1,1],[1,0]], level: 5 },
    pento_t: { shape: [[1,1,1],[0,1,0],[0,1,0]], level: 5 },
    pento_u: { shape: [[1,0,1],[1,1,1]], level: 5 },
    pento_v: { shape: [[1,0,0],[1,0,0],[1,1,1]], level: 5 },
    pento_w: { shape: [[1,0,0],[1,1,0],[0,1,1]], level: 5 },
    pento_x: { shape: [[0,1,0],[1,1,1],[0,1,0]], level: 5 },
    pento_y: { shape: [[0,1],[1,1],[0,1],[0,1]], level: 5 },
    pento_z: { shape: [[1,1,0],[0,1,0],[0,1,1]], level: 5 },
};

const PENTOMINOES = ['pento_f', 'pento_i', 'pento_l', 'pento_n', 'pento_p', 'pento_t', 'pento_u', 'pento_v', 'pento_w', 'pento_x', 'pento_y', 'pento_z'];
const REWARDS = ['domino', 'tromino_i', 'tromino_l', 'tetro_i', 'tetro_o', 'tetro_t', 'tetro_s', 'tetro_l'];

// SAVE_VERSION: Increment when changing saved state structure. See SAVE/LOAD SYSTEM docs below.
const SAVE_VERSION = 2;
const STORAGE_KEY = 'polyomino-save';
const CONSENT_KEY = 'polyomino-storage-consent';

let advancedMode = false;
let playerPieces = [{ type: 'dot' }, { type: 'domino' }]; // { type, expiry? }
let tier1Puzzles = [];
let tier2Puzzles = [];
let seenPuzzles = new Set();
let puzzleHistory = [];
let puzzleSeq = { 1: 0, 2: 0 };

const TIER1_TURNS = 8;
const TIER2_TURNS = 12;
const PIECE_EXPIRY = 15;
let points = 0;
let totalTurns = 0;
let stats = { tier1Solved: 0, tier1Expired: 0, tier2Solved: 0, tier2Expired: 0 };
let draggedPiece = null;
let draggedIndex = null;
let draggedFromPuzzle = null;
let currentRotation = 0;
let currentMirror = false;
let selectedPiece = null;
let sacrificeMode = false;
let sacrificeSelection = []; // indices of pieces selected for sacrifice
let lastPlacement = null; // { tier, puzzleIndex, placedIndex, pieceType } for undo
let touchStartTime = 0;

/*
 * ============================================================================
 * SAVE/LOAD SYSTEM
 * ============================================================================
 * Game state is automatically saved to localStorage after every action.
 * 
 * IMPORTANT FOR FUTURE CHANGES:
 * If you modify any of the saved state variables (playerPieces, tier1Puzzles,
 * tier2Puzzles, puzzleHistory, puzzleSeq, points, totalTurns, stats), you MUST:
 * 
 * 1. Increment SAVE_VERSION at the top of this file
 * 2. Add migration logic in loadGame() to convert old saves to new format
 * 
 * Example migration:
 *   if (state.version === 1) {
 *       state.newField = defaultValue;  // Add new field with default
 *       delete state.oldField;          // Remove deprecated field
 *       state.version = 2;
 *   }
 *   if (state.version === 2) { ... }    // Chain migrations
 * 
 * Without migration, old saves will be discarded and players lose progress!
 * ============================================================================
 */

function hasStorageConsent() {
    try {
        return localStorage.getItem(CONSENT_KEY) === 'yes';
    } catch (e) {
        return false;
    }
}

function saveGame() {
    if (!hasStorageConsent()) return;
    const state = {
        version: SAVE_VERSION,
        advancedMode,
        playerPieces,
        tier1Puzzles,
        tier2Puzzles,
        seenPuzzles: [...seenPuzzles],
        puzzleHistory: puzzleHistory.slice(-200),
        puzzleSeq,
        points,
        totalTurns,
        stats
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to save:', e);
    }
}

function loadGame() {
    if (!hasStorageConsent()) return false;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return false;
        const state = JSON.parse(saved);
        
        // Migration v1 -> v2: Add advancedMode, convert playerPieces to objects
        if (state.version === 1) {
            state.advancedMode = false;
            state.playerPieces = state.playerPieces.map(p => 
                typeof p === 'string' ? { type: p } : p
            );
            state.version = 2;
        }
        
        // Fix v2 saves that may have string playerPieces (from partial migration)
        if (state.playerPieces && state.playerPieces.some(p => typeof p === 'string')) {
            state.playerPieces = state.playerPieces.map(p => 
                typeof p === 'string' ? { type: p } : p
            );
        }
        
        // Migrate lockedPiece -> requiredPiece in puzzles
        [...(state.tier1Puzzles || []), ...(state.tier2Puzzles || [])].forEach(p => {
            if (p.lockedPiece) {
                p.requiredPiece = p.lockedPiece;
                delete p.lockedPiece;
            }
        });
        
        if (state.version !== SAVE_VERSION) {
            console.warn('Save version mismatch, starting fresh');
            return false;
        }
        advancedMode = state.advancedMode || false;
        playerPieces = state.playerPieces;
        tier1Puzzles = state.tier1Puzzles;
        tier2Puzzles = state.tier2Puzzles;
        seenPuzzles = new Set(state.seenPuzzles);
        puzzleHistory = state.puzzleHistory;
        puzzleSeq = state.puzzleSeq;
        points = state.points;
        totalTurns = state.totalTurns;
        stats = state.stats;
        return true;
    } catch (e) {
        console.warn('Failed to load save:', e);
        return false;
    }
}

function resetGame() {
    if (!confirm('Reset game? All progress will be lost.')) return;
    localStorage.removeItem(STORAGE_KEY);
    const keepAdvanced = advancedMode;
    advancedMode = keepAdvanced;
    playerPieces = [{ type: 'dot' }, { type: 'domino' }];
    if (keepAdvanced) {
        playerPieces[0].expiry = PIECE_EXPIRY;
        playerPieces[1].expiry = PIECE_EXPIRY;
    }
    tier1Puzzles = [];
    tier2Puzzles = [];
    seenPuzzles = new Set();
    puzzleHistory = [];
    puzzleSeq = { 1: 0, 2: 0 };
    points = 0;
    totalTurns = 0;
    stats = { tier1Solved: 0, tier1Expired: 0, tier2Solved: 0, tier2Expired: 0 };
    selectedPiece = null;
    currentRotation = 0;
    currentMirror = false;
    addEasyPuzzle();
    for (let i = 0; i < 3; i++) addNewPuzzle(1);
    for (let i = 0; i < 4; i++) addNewPuzzle(2);
    render();
}

function toggleAdvancedMode() {
    advancedMode = !advancedMode;
    // Add expiry to pieces that don't have it when entering advanced mode
    if (advancedMode) {
        playerPieces.forEach(p => {
            if (p.expiry === undefined) p.expiry = PIECE_EXPIRY;
        });
    }
    render();
}

const PIECE_LIMIT = 12;

function addPieceToHand(type) {
    if (advancedMode && playerPieces.length >= PIECE_LIMIT) return false;
    const piece = { type };
    if (advancedMode) piece.expiry = PIECE_EXPIRY;
    playerPieces.push(piece);
    return true;
}

function showStorageConsent() {
    const banner = document.getElementById('storage-consent');
    if (banner && !hasStorageConsent()) {
        banner.classList.remove('hidden');
    }
}

function acceptStorage() {
    try {
        localStorage.setItem(CONSENT_KEY, 'yes');
    } catch (e) {}
    document.getElementById('storage-consent').classList.add('hidden');
    saveGame();
}

function declineStorage() {
    document.getElementById('storage-consent').classList.add('hidden');
}

// Puzzle generation
function generateRandomPuzzle(targetCells, advanced = false) {
    const maxDim = advanced ? Math.min(7, targetCells) : Math.min(6, targetCells);
    const width = Math.floor(Math.random() * (maxDim - 1)) + 2;
    const height = Math.floor(Math.random() * (maxDim - 1)) + 2;
    
    const grid = Array(height).fill(null).map(() => Array(width).fill(0));
    let cells = [{ r: Math.floor(Math.random() * height), c: Math.floor(Math.random() * width) }];
    grid[cells[0].r][cells[0].c] = 1;
    let filled = 1;
    
    while (filled < targetCells) {
        const adjacent = [];
        for (const cell of cells) {
            for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
                const nr = cell.r + dr, nc = cell.c + dc;
                if (nr >= 0 && nr < height && nc >= 0 && nc < width && !grid[nr][nc]) {
                    adjacent.push({ r: nr, c: nc });
                }
            }
        }
        if (adjacent.length === 0) break;
        const next = adjacent[Math.floor(Math.random() * adjacent.length)];
        grid[next.r][next.c] = 1;
        cells.push(next);
        filled++;
    }
    
    let trimmed = grid.filter(row => row.some(c => c));
    if (trimmed.length === 0) return null;
    const minCol = Math.min(...trimmed.map(row => row.findIndex(c => c)).filter(i => i >= 0));
    const maxCol = Math.max(...trimmed.map(row => row.lastIndexOf(1)));
    trimmed = trimmed.map(row => row.slice(minCol, maxCol + 1));
    return trimmed;
}

function countCells(grid) {
    return grid.flat().filter(c => c).length;
}

function normalizeGrid(grid) {
    let g = grid.filter(row => row.some(c => c));
    if (g.length === 0) return '[]';
    const minCol = Math.min(...g.map(row => row.findIndex(c => c)).filter(i => i >= 0));
    const maxCol = Math.max(...g.map(row => row.lastIndexOf(1)));
    g = g.map(row => row.slice(minCol, maxCol + 1));
    return JSON.stringify(g);
}

function rotateGrid(grid) {
    const rows = grid.length, cols = grid[0].length;
    const rotated = [];
    for (let c = 0; c < cols; c++) {
        rotated.push([]);
        for (let r = rows - 1; r >= 0; r--) {
            rotated[c].push(grid[r][c]);
        }
    }
    return rotated;
}

function mirrorGrid(grid) {
    return grid.map(row => [...row].reverse());
}

function getCanonical(grid) {
    let variants = [];
    let g = grid;
    for (let i = 0; i < 4; i++) {
        variants.push(normalizeGrid(g));
        variants.push(normalizeGrid(mirrorGrid(g)));
        g = rotateGrid(g);
    }
    return variants.sort()[0];
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16).slice(0, 4);
}

function isInteresting(grid) {
    const cells = countCells(grid);
    const rows = grid.length;
    const cols = grid[0].length;
    const boundingArea = rows * cols;
    const fillRatio = cells / boundingArea;
    const emptyInBounds = boundingArea - cells;
    
    // Reject perfect rectangles
    if (cells === boundingArea && rows > 1 && cols > 1) return false;
    
    // Reject near-rectangles (1-2 cells missing from bounding box)
    if (emptyInBounds <= 2 && Math.min(rows, cols) >= 2 && cells > 4) return false;
    
    // Reject high fill ratio for chunky shapes
    if (fillRatio > 0.75 && Math.min(rows, cols) > 2) return false;
    
    let holes = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c]) continue;
            const neighbors = [[0,1],[0,-1],[1,0],[-1,0]].filter(([dr,dc]) => {
                const nr = r + dr, nc = c + dc;
                return nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc];
            });
            if (neighbors.length >= 3) holes++;
        }
    }
    
    if (cells >= 8 && fillRatio > 0.65 && holes === 0) return false;
    return true;
}

function getReward(cells) {
    if (cells <= 2) return 'domino';
    if (cells <= 3) return REWARDS[1 + Math.floor(Math.random() * 2)];
    return REWARDS[3 + Math.floor(Math.random() * 5)];
}

function generatePuzzle(tier) {
    const [minCells, maxCells] = tier === 1 ? [2, 5] : (advancedMode ? [10, 20] : [6, 14]);
    const maxTurns = tier === 1 ? TIER1_TURNS : TIER2_TURNS;
    
    for (let attempts = 0; attempts < 500; attempts++) {
        const targetCells = minCells + Math.floor(Math.random() * (maxCells - minCells + 1));
        const grid = generateRandomPuzzle(targetCells, advancedMode);
        if (!grid) continue;
        
        const cells = countCells(grid);
        if (cells < minCells || cells > maxCells) continue;
        if (!isInteresting(grid)) continue;
        
        const canonical = getCanonical(grid);
        if (seenPuzzles.has(canonical)) continue;
        
        seenPuzzles.add(canonical);
        puzzleSeq[tier]++;
        
        const id = `T${tier}-${String(puzzleSeq[tier]).padStart(3, '0')}-${hashCode(canonical)}`;
        const pts = tier === 1 ? 0 : Math.floor(cells * 0.8);
        const reward = tier === 1 ? getReward(cells) : null;
        
        // Add required piece constraint in advanced mode (20% chance for T2)
        let requiredPiece = null;
        if (advancedMode && tier === 2 && Math.random() < 0.2) {
            // Pick piece type: 5% L2, 40% L3, 40% L4, 15% L5
            const roll = Math.random();
            let pieceType;
            if (roll < 0.05) pieceType = 'domino';
            else if (roll < 0.45) pieceType = ['tromino_i', 'tromino_l'][Math.floor(Math.random() * 2)];
            else if (roll < 0.85) pieceType = ['tetro_i', 'tetro_l', 'tetro_t', 'tetro_s', 'tetro_o'][Math.floor(Math.random() * 5)];
            else pieceType = PENTOMINOES[Math.floor(Math.random() * PENTOMINOES.length)];
            
            // Random rotation and mirror for the required placement
            const rotation = Math.floor(Math.random() * 4);
            const mirror = Math.random() < 0.5;
            const shape = getRotatedShape(pieceType, rotation, mirror);
            
            // Find valid placement within puzzle
            const validPlacements = [];
            for (let r = 0; r <= grid.length - shape.length; r++) {
                for (let c = 0; c <= grid[0].length - shape[0].length; c++) {
                    let fits = true;
                    for (let sr = 0; sr < shape.length && fits; sr++) {
                        for (let sc = 0; sc < shape[0].length && fits; sc++) {
                            if (shape[sr][sc] && (!grid[r + sr] || !grid[r + sr][c + sc])) fits = false;
                        }
                    }
                    if (fits) validPlacements.push({ row: r, col: c });
                }
            }
            
            if (validPlacements.length > 0) {
                const pos = validPlacements[Math.floor(Math.random() * validPlacements.length)];
                requiredPiece = { type: pieceType, row: pos.row, col: pos.col, rotation, mirror };
            }
        }
        
        const puzzle = { id, grid, points: pts, reward, tier, placedPieces: [], turnsLeft: maxTurns, maxTurns, requiredPiece };
        puzzleHistory.push({ id, grid: JSON.parse(JSON.stringify(grid)), tier, cells, timestamp: Date.now(), status: 'active' });
        return puzzle;
    }
    
    // Fallback: clear seen and try again
    seenPuzzles.clear();
    return generatePuzzle(tier);
}

function addNewPuzzle(tier) {
    const target = tier === 1 ? tier1Puzzles : tier2Puzzles;
    target.push(generatePuzzle(tier));
}

function updatePuzzleStatus(id, status) {
    const entry = puzzleHistory.find(p => p.id === id);
    if (entry) entry.status = status;
}

function rotateShape(shape) {
    const rows = shape.length, cols = shape[0].length;
    const rotated = [];
    for (let c = 0; c < cols; c++) {
        rotated.push([]);
        for (let r = rows - 1; r >= 0; r--) {
            rotated[c].push(shape[r][c]);
        }
    }
    return rotated;
}

function mirrorShape(shape) {
    return shape.map(row => [...row].reverse());
}

function getRotatedShape(type, rotation, mirror = false) {
    let shape = PIECES[type].shape;
    for (let i = 0; i < rotation % 4; i++) shape = rotateShape(shape);
    if (mirror) shape = mirrorShape(shape);
    return shape;
}

function createPieceElement(type, index, rotation = 0, isSupply = true, mirror = false, expiry = undefined) {
    const shape = getRotatedShape(type, rotation, mirror);
    const baseShape = PIECES[type].shape;
    const maxDim = Math.max(baseShape.length, baseShape[0].length);
    
    const el = document.createElement('div');
    el.className = 'piece';
    
    // Highlight selected piece or sacrifice selection
    const isSelected = selectedPiece && selectedPiece.type === type && 
        (isSupply ? selectedPiece.index === index && !selectedPiece.fromPuzzle : false);
    if (isSelected) el.classList.add('selected');
    if (sacrificeMode && sacrificeSelection.includes(index)) el.classList.add('sacrifice-selected');
    
    // Debug tooltip
    const piece = PIECES[type];
    const cellCount = piece.shape.flat().filter(c => c).length;
    el.title = `${type}\nLevel: ${piece.level}\nCells: ${cellCount}\nRotation: ${rotation * 90}°\nMirrored: ${mirror}`;
    
    if (isSupply) {
        el.draggable = true;
        el.dataset.type = type;
        el.dataset.index = index;
        el.style.width = (maxDim * 20 + 10) + 'px';
        el.style.height = (maxDim * 20 + 10) + 'px';
    }
    
    const grid = document.createElement('div');
    grid.className = 'piece-grid';
    grid.style.gridTemplateColumns = `repeat(${shape[0].length}, 20px)`;
    
    shape.flat().forEach(cell => {
        const cellEl = document.createElement('div');
        cellEl.className = 'cell' + (cell ? ' filled' : '');
        grid.appendChild(cellEl);
    });
    
    el.appendChild(grid);
    
    // Add expiry badge only in advanced mode
    if (isSupply && advancedMode && expiry !== undefined) {
        const badge = document.createElement('div');
        badge.className = 'expiry-badge' + (expiry <= 3 ? ' expiry-low' : '');
        badge.textContent = expiry;
        el.appendChild(badge);
    }
    
    if (isSupply) {
        el.addEventListener('dragstart', e => {
            if (sacrificeMode) { e.preventDefault(); return; }
            draggedPiece = type;
            draggedIndex = index;
            el.classList.add('dragging');
        });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
        el.addEventListener('click', () => {
            if (sacrificeMode) {
                const level = PIECES[type].level;
                if (sacrificeSelection.includes(index)) {
                    // Deselect
                    sacrificeSelection = sacrificeSelection.filter(i => i !== index);
                } else if (sacrificeSelection.length < 3) {
                    // Check if same level as first selection (or first pick), and not max level
                    const maxLevel = Math.max(...Object.values(PIECES).map(p => p.level));
                    if (level < maxLevel && (sacrificeSelection.length === 0 || PIECES[playerPieces[sacrificeSelection[0]].type].level === level)) {
                        sacrificeSelection.push(index);
                    }
                }
                render();
                return;
            }
            if (selectedPiece && selectedPiece.type === type && selectedPiece.index === index) {
                currentRotation = (currentRotation + 1) % 4;
            } else {
                selectedPiece = { type, index };
            }
            render();
        });
        el.addEventListener('contextmenu', e => {
            e.preventDefault();
            currentMirror = !currentMirror;
            render();
        });
        
        // Touch support - long-press to mirror
        el.addEventListener('touchstart', e => {
            touchStartTime = Date.now();
        }, { passive: true });
        el.addEventListener('touchend', e => {
            e.preventDefault();
            if (Date.now() - touchStartTime > 400) {
                currentMirror = !currentMirror;
                render();
            }
            // Click handler handles select/rotate
        });
    }
    
    return el;
}

function createTimerSVG(turnsLeft, maxTurns) {
    const pct = turnsLeft / maxTurns;
    const color = pct > 0.6 ? '#4a4' : pct >= 0.3 ? '#ca2' : '#c44';
    const size = 36;
    const r = 14;
    const cx = size / 2;
    const cy = size / 2;
    
    let wedges = '';
    for (let i = 0; i < maxTurns; i++) {
        if (i >= turnsLeft) continue;
        const startAngle = (i / maxTurns) * 2 * Math.PI - Math.PI / 2;
        const endAngle = ((i + 1) / maxTurns) * 2 * Math.PI - Math.PI / 2;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArc = (endAngle - startAngle > Math.PI) ? 1 : 0;
        wedges += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z" fill="${color}" stroke="#222" stroke-width="0.5"/>`;
    }
    
    return `<svg width="${size}" height="${size}" class="timer">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#333" stroke="#555" stroke-width="1"/>
        ${wedges}
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="12" font-weight="bold">${turnsLeft}</text>
    </svg>`;
}

function createPuzzleElement(puzzle, index, tier) {
    const el = document.createElement('div');
    el.className = 'puzzle';
    el.dataset.index = index;
    el.dataset.tier = tier;
    
    // Debug tooltip with full puzzle state
    const cells = puzzle.grid.flat().filter(c => c).length;
    const gridStr = puzzle.grid.map(r => r.map(c => c ? '█' : '·').join('')).join('\n');
    const placedStr = puzzle.placedPieces.map(p => 
        `${p.type}@${p.row},${p.col} r${p.rotation}${p.mirror ? 'm' : ''}`
    ).join('; ') || 'none';
    const reqStr = puzzle.requiredPiece ? 
        `${puzzle.requiredPiece.type}@${puzzle.requiredPiece.row},${puzzle.requiredPiece.col} r${puzzle.requiredPiece.rotation}${puzzle.requiredPiece.mirror ? 'm' : ''}` : 'none';
    
    const debugInfo = `ID: ${puzzle.id}
Grid: ${puzzle.grid[0].length}x${puzzle.grid.length} (${cells} cells)
Turns: ${puzzle.turnsLeft}/${puzzle.maxTurns}
Required: ${reqStr}
Placed: ${placedStr}
Layout:
${gridStr}`;
    
    el.title = debugInfo;
    
    // Double-click to copy debug info
    el.addEventListener('dblclick', () => {
        navigator.clipboard.writeText(debugInfo).then(() => {
            console.log('Puzzle debug info copied to clipboard');
        });
    });
    
    const grid = document.createElement('div');
    grid.className = 'puzzle-grid';
    grid.style.gridTemplateColumns = `repeat(${puzzle.grid[0].length}, 1fr)`;
    
    // Build display grid with placed pieces
    const displayGrid = puzzle.grid.map(row => row.map(c => c ? 'empty' : 'solid'));
    
    // Check if required piece constraint is satisfied
    let requiredSatisfied = false;
    if (puzzle.requiredPiece) {
        const rp = puzzle.requiredPiece;
        requiredSatisfied = puzzle.placedPieces.some(p => 
            p.type === rp.type && p.row === rp.row && p.col === rp.col && 
            p.rotation === rp.rotation && p.mirror === rp.mirror
        );
    }
    
    // Show required piece ghost if not yet satisfied
    if (puzzle.requiredPiece && !requiredSatisfied) {
        const rp = puzzle.requiredPiece;
        const shape = getRotatedShape(rp.type, rp.rotation, rp.mirror);
        shape.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell && displayGrid[rp.row + r] && displayGrid[rp.row + r][rp.col + c] !== undefined) {
                    displayGrid[rp.row + r][rp.col + c] = 'required';
                }
            });
        });
    }
    
    puzzle.placedPieces.forEach((placed, placedIdx) => {
        const shape = getRotatedShape(placed.type, placed.rotation, placed.mirror);
        const isSelected = selectedPiece?.fromPuzzle?.tier === tier && 
            selectedPiece?.fromPuzzle?.puzzleIndex === index && 
            selectedPiece?.fromPuzzle?.placedIndex === placedIdx;
        shape.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell && displayGrid[placed.row + r] && displayGrid[placed.row + r][placed.col + c] !== undefined) {
                    displayGrid[placed.row + r][placed.col + c] = isSelected ? 'filled selected-placed' : 'filled';
                }
            });
        });
    });
    
    displayGrid.forEach((row, r) => {
        row.forEach((state, c) => {
            const cellEl = document.createElement('div');
            cellEl.className = 'cell ' + state;
            cellEl.dataset.row = r;
            cellEl.dataset.col = c;
            
            // Make filled cells draggable to move pieces (not locked cells)
            if (state === 'filled' || state === 'filled selected-placed') {
                cellEl.draggable = true;
                cellEl.style.cursor = 'grab';
                cellEl.addEventListener('dragstart', e => {
                    // Find which placed piece this cell belongs to
                    const placedIdx = puzzle.placedPieces.findIndex(placed => {
                        const shape = getRotatedShape(placed.type, placed.rotation, placed.mirror);
                        return shape.some((row, pr) => row.some((cell, pc) => 
                            cell && placed.row + pr === r && placed.col + pc === c
                        ));
                    });
                    if (placedIdx >= 0) {
                        const placed = puzzle.placedPieces[placedIdx];
                        draggedPiece = placed.type;
                        draggedIndex = null;
                        // Only use placed piece's rotation if not already selected (user may have rotated)
                        if (!selectedPiece?.fromPuzzle || selectedPiece.fromPuzzle.placedIndex !== placedIdx) {
                            currentRotation = placed.rotation;
                            currentMirror = placed.mirror;
                        }
                        draggedFromPuzzle = { tier, puzzleIndex: index, placedIndex: placedIdx };
                        selectedPiece = null;
                    }
                });
                
                // Touch drag for placed pieces - just use tap to pick up
                cellEl.addEventListener('touchend', e => {
                    e.preventDefault();
                    const placedIdx = puzzle.placedPieces.findIndex(placed => {
                        const shape = getRotatedShape(placed.type, placed.rotation, placed.mirror);
                        return shape.some((row, pr) => row.some((cell, pc) => 
                            cell && placed.row + pr === r && placed.col + pc === c
                        ));
                    });
                    if (placedIdx >= 0) {
                        const placed = puzzle.placedPieces[placedIdx];
                        selectedPiece = { type: placed.type, index: null, fromPuzzle: { tier, puzzleIndex: index, placedIndex: placedIdx } };
                        currentRotation = placed.rotation;
                        currentMirror = placed.mirror;
                        render();
                    }
                });
            }
            
            // Each cell is a drop target
            cellEl.addEventListener('dragover', e => {
                e.preventDefault();
                if (draggedPiece === null) return;
                const shape = getRotatedShape(draggedPiece, currentRotation, currentMirror);
                clearPreview(grid);
                showPreview(grid, puzzle, shape, r, c, draggedFromPuzzle?.placedIndex, draggedPiece, currentRotation, currentMirror);
            });
            cellEl.addEventListener('dragleave', e => {
                if (!grid.contains(e.relatedTarget)) clearPreview(grid);
            });
            cellEl.addEventListener('drop', e => {
                e.preventDefault();
                const bestRow = parseInt(grid.dataset.bestRow);
                const bestCol = parseInt(grid.dataset.bestCol);
                clearPreview(grid);
                if (!isNaN(bestRow) && !isNaN(bestCol)) {
                    tryPlacePieceAt(tier, index, bestRow, bestCol);
                }
            });
            
            // Click/tap to place selected piece
            const handlePlace = e => {
                e.preventDefault();
                if (selectedPiece) {
                    draggedPiece = selectedPiece.type;
                    draggedIndex = selectedPiece.index;
                    draggedFromPuzzle = selectedPiece.fromPuzzle || null;
                    const shape = getRotatedShape(draggedPiece, currentRotation, currentMirror);
                    const best = findBestPlacement(puzzle, shape, r, c, draggedFromPuzzle?.placedIndex, draggedPiece, currentRotation, currentMirror);
                    if (best) {
                        tryPlacePieceAt(tier, index, best.row, best.col);
                        selectedPiece = null;
                    }
                } else if (state === 'filled') {
                    // Click placed piece to pick it up
                    const placedIdx = puzzle.placedPieces.findIndex(placed => {
                        const shape = getRotatedShape(placed.type, placed.rotation, placed.mirror);
                        return shape.some((row, pr) => row.some((cell, pc) => 
                            cell && placed.row + pr === r && placed.col + pc === c
                        ));
                    });
                    if (placedIdx >= 0) {
                        const placed = puzzle.placedPieces[placedIdx];
                        selectedPiece = { type: placed.type, index: null, fromPuzzle: { tier, puzzleIndex: index, placedIndex: placedIdx } };
                        currentRotation = placed.rotation;
                        currentMirror = placed.mirror;
                        render();
                    }
                }
            };
            cellEl.addEventListener('click', handlePlace);
            cellEl.addEventListener('touchend', handlePlace);
            
            grid.appendChild(cellEl);
        });
    });
    
    // Add timer
    const timerContainer = document.createElement('div');
    timerContainer.className = 'timer-container';
    timerContainer.innerHTML = createTimerSVG(puzzle.turnsLeft, puzzle.maxTurns);
    
    // Add reward section
    const rewardSection = document.createElement('div');
    rewardSection.className = 'reward-section';
    if (puzzle.reward) {
        const rewardEl = createPieceElement(puzzle.reward, -1, 0, false);
        rewardEl.classList.add('reward-preview');
        rewardSection.appendChild(rewardEl);
    } else if (advancedMode) {
        // Par-based scoring: points decrease in thirds as timer depletes
        const cells = puzzle.grid.flat().filter(c => c).length;
        const base = Math.ceil(cells / 2) + (puzzle.requiredPiece ? 3 : 0);
        const timerPct = puzzle.turnsLeft / puzzle.maxTurns;
        let pts, color;
        if (timerPct > 0.6) {
            pts = base; color = '#4a4';
        } else if (timerPct > 0.3) {
            pts = Math.floor(base * 2 / 3); color = '#ca2';
        } else {
            pts = Math.floor(base / 3); color = '#c44';
        }
        rewardSection.innerHTML = `<span class="points-reward" style="color:${color}">${pts} pts</span>`;
    } else {
        rewardSection.innerHTML = `<span class="points-reward">${puzzle.points} pts</span>`;
    }
    
    el.appendChild(grid);
    el.appendChild(timerContainer);
    el.appendChild(rewardSection);
    
    el.addEventListener('dragleave', e => {
        if (!el.contains(e.relatedTarget)) clearPreview(grid);
    });
    
    return el;
}

function clearPreview(grid) {
    grid.querySelectorAll('.preview, .preview-invalid').forEach(cell => {
        cell.classList.remove('preview', 'preview-invalid');
    });
    delete grid.dataset.bestRow;
    delete grid.dataset.bestCol;
}

function findBestPlacement(puzzle, shape, targetRow, targetCol, ignorePlacedIdx = -1, pieceType = null, rotation = 0, mirror = false) {
    // Try positions in order of distance from target cell
    const positions = [];
    for (let r = -shape.length + 1; r < puzzle.grid.length; r++) {
        for (let c = -shape[0].length + 1; c < puzzle.grid[0].length; c++) {
            if (canPlace(puzzle, shape, r, c, ignorePlacedIdx, pieceType, rotation, mirror)) {
                // Calculate distance from target to each cell of the shape
                let minDist = Infinity;
                shape.forEach((row, sr) => {
                    row.forEach((cell, sc) => {
                        if (cell) {
                            const dist = Math.abs((r + sr) - targetRow) + Math.abs((c + sc) - targetCol);
                            minDist = Math.min(minDist, dist);
                        }
                    });
                });
                positions.push({ row: r, col: c, dist: minDist });
            }
        }
    }
    
    if (positions.length === 0) return null;
    positions.sort((a, b) => a.dist - b.dist);
    return positions[0];
}

function showPreview(grid, puzzle, shape, startRow, startCol, ignorePlacedIdx = -1, pieceType = null, rotation = 0, mirror = false) {
    const cols = puzzle.grid[0].length;
    const best = findBestPlacement(puzzle, shape, startRow, startCol, ignorePlacedIdx, pieceType, rotation, mirror);
    
    if (!best) return;
    
    shape.forEach((row, r) => {
        row.forEach((cell, c) => {
            if (!cell) return;
            const pr = best.row + r, pc = best.col + c;
            if (pr < 0 || pr >= puzzle.grid.length || pc < 0 || pc >= cols) return;
            const cellEl = grid.children[pr * cols + pc];
            if (cellEl) cellEl.classList.add('preview');
        });
    });
    
    // Store best placement for drop
    grid.dataset.bestRow = best.row;
    grid.dataset.bestCol = best.col;
}

function canPlace(puzzle, shape, startRow, startCol, ignorePlacedIdx = -1, pieceType = null, rotation = 0, mirror = false) {
    // Check if this is the exact required piece placement
    const isExactRequiredMatch = puzzle.requiredPiece && 
        pieceType === puzzle.requiredPiece.type && 
        startRow === puzzle.requiredPiece.row && 
        startCol === puzzle.requiredPiece.col && 
        rotation === puzzle.requiredPiece.rotation && 
        mirror === puzzle.requiredPiece.mirror;
    
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[0].length; c++) {
            if (!shape[r][c]) continue;
            const pr = startRow + r, pc = startCol + c;
            if (pr < 0 || pr >= puzzle.grid.length || pc < 0 || pc >= puzzle.grid[0].length) return false;
            if (!puzzle.grid[pr][pc]) return false; // solid area
            // Check if overlaps required piece area (only exact match allowed)
            if (puzzle.requiredPiece && !isExactRequiredMatch) {
                const rp = puzzle.requiredPiece;
                const rpShape = getRotatedShape(rp.type, rp.rotation, rp.mirror);
                const overlapsRequired = rpShape.some((row, rr) => row.some((cell, rc) =>
                    cell && rp.row + rr === pr && rp.col + rc === pc
                ));
                if (overlapsRequired) return false;
            }
            // Check if already filled (ignoring the piece being moved)
            const filled = puzzle.placedPieces.some((placed, idx) => {
                if (idx === ignorePlacedIdx) return false;
                const ps = getRotatedShape(placed.type, placed.rotation, placed.mirror);
                return ps.some((row, psr) => row.some((cell, psc) => 
                    cell && placed.row + psr === pr && placed.col + psc === pc
                ));
            });
            if (filled) return false;
        }
    }
    return true;
}

function findPlacement(puzzle, shape) {
    for (let r = 0; r < puzzle.grid.length; r++) {
        for (let c = 0; c < puzzle.grid[0].length; c++) {
            if (canPlace(puzzle, shape, r, c)) return { row: r, col: c };
        }
    }
    return null;
}

function tryPlacePieceAt(tier, puzzleIndex, row, col) {
    if (draggedPiece === null) return;
    
    const puzzleArray = tier === 1 ? tier1Puzzles : tier2Puzzles;
    const puzzle = puzzleArray[puzzleIndex];
    const shape = getRotatedShape(draggedPiece, currentRotation, currentMirror);
    
    // Check for touch-based move from puzzle
    const fromPuzzle = draggedFromPuzzle || (selectedPiece && selectedPiece.fromPuzzle);
    
    // Check if moving within same puzzle
    const isMovingWithinSamePuzzle = fromPuzzle && 
        fromPuzzle.tier === tier && 
        fromPuzzle.puzzleIndex === puzzleIndex;
    
    const ignorePlacedIdx = isMovingWithinSamePuzzle ? fromPuzzle.placedIndex : -1;
    
    if (canPlace(puzzle, shape, row, col, ignorePlacedIdx, draggedPiece, currentRotation, currentMirror)) {
        // Remove from source
        if (fromPuzzle) {
            const srcArray = fromPuzzle.tier === 1 ? tier1Puzzles : tier2Puzzles;
            srcArray[fromPuzzle.puzzleIndex].placedPieces.splice(fromPuzzle.placedIndex, 1);
        } else if (draggedIndex !== null) {
            playerPieces.splice(draggedIndex, 1);
        }
        
        // Add to target
        puzzle.placedPieces.push({ type: draggedPiece, rotation: currentRotation, mirror: currentMirror, row, col });
        const placedIndex = puzzle.placedPieces.length - 1;
        
        // Track for undo (only if placing from hand, not moving within puzzle)
        const canUndo = !fromPuzzle && draggedIndex !== null;
        
        // Check completion BEFORE decrementing turns (which may modify puzzle arrays)
        const totalEmpty = puzzle.grid.flat().filter(c => c).length;
        const totalFilled = puzzle.placedPieces.reduce((sum, p) => 
            sum + getRotatedShape(p.type, p.rotation, p.mirror).flat().filter(c => c).length, 0);
        
        // Check required piece constraint
        let requiredSatisfied = true;
        if (puzzle.requiredPiece) {
            const rp = puzzle.requiredPiece;
            requiredSatisfied = puzzle.placedPieces.some(p => 
                p.type === rp.type && p.row === rp.row && p.col === rp.col && 
                p.rotation === rp.rotation && p.mirror === rp.mirror
            );
        }
        
        const isComplete = totalFilled >= totalEmpty && requiredSatisfied;
        
        // Only decrement turns if NOT moving within same puzzle
        if (!isMovingWithinSamePuzzle) {
            decrementAllTurns();
        }
        
        if (isComplete) {
            // Puzzle completed - no undo available
            lastPlacement = null;
            // Calculate points
            if (advancedMode && tier === 2) {
                // Par-based scoring: fractions of base based on timer
                const cells = totalEmpty;
                const base = Math.ceil(cells / 2) + (puzzle.requiredPiece ? 3 : 0);
                const timerPct = (puzzle.turnsLeft + 1) / puzzle.maxTurns; // +1 because we already decremented
                let pts;
                if (timerPct > 0.6) pts = base;
                else if (timerPct > 0.3) pts = Math.floor(base * 2 / 3);
                else pts = Math.floor(base / 3);
                points += pts;
            } else {
                points += puzzle.points;
            }
            puzzle.placedPieces.forEach(p => addPieceToHand(p.type));
            if (puzzle.reward) addPieceToHand(puzzle.reward);
            if (tier === 1) stats.tier1Solved++;
            else stats.tier2Solved++;
            updatePuzzleStatus(puzzle.id, 'solved');
            // Find puzzle by ID since index may have changed after decrementAllTurns
            const idx = puzzleArray.findIndex(p => p.id === puzzle.id);
            if (idx >= 0) puzzleArray.splice(idx, 1);
            addNewPuzzle(tier);
            selectedPiece = null;
        } else if (canUndo) {
            // Track for undo - find current index
            const idx = puzzleArray.findIndex(p => p.id === puzzle.id);
            lastPlacement = { tier, puzzleIndex: idx, placedIndex, pieceType: draggedPiece };
        }
        render();
    }
    
    draggedPiece = null;
    draggedIndex = null;
    draggedFromPuzzle = null;
}

function decrementAllTurns() {
    totalTurns++;
    [tier1Puzzles, tier2Puzzles].forEach((puzzles, tierIdx) => {
        const tier = tierIdx + 1;
        for (let i = puzzles.length - 1; i >= 0; i--) {
            puzzles[i].turnsLeft--;
            if (puzzles[i].turnsLeft <= 0) {
                // Puzzle expired - refund pieces (standard mode only)
                if (!advancedMode) {
                    puzzles[i].placedPieces.forEach(p => addPieceToHand(p.type));
                }
                if (tier === 1) stats.tier1Expired++;
                else stats.tier2Expired++;
                updatePuzzleStatus(puzzles[i].id, 'expired');
                puzzles.splice(i, 1);
                addNewPuzzle(tier);
            }
        }
    });
    
    // Decrement piece expiry in advanced mode
    if (advancedMode) {
        for (let i = playerPieces.length - 1; i >= 0; i--) {
            if (playerPieces[i].expiry !== undefined) {
                playerPieces[i].expiry--;
                if (playerPieces[i].expiry <= 0) {
                    playerPieces.splice(i, 1);
                }
            }
        }
    }
}

function render() {
    const puzzleRow1 = document.getElementById('puzzle-row-1');
    const puzzleRow2 = document.getElementById('puzzle-row-2');
    const pieceSupply = document.getElementById('piece-supply');
    
    puzzleRow1.innerHTML = '';
    tier1Puzzles.forEach((p, i) => puzzleRow1.appendChild(createPuzzleElement(p, i, 1)));
    
    puzzleRow2.innerHTML = '';
    tier2Puzzles.forEach((p, i) => puzzleRow2.appendChild(createPuzzleElement(p, i, 2)));
    
    pieceSupply.innerHTML = '';
    const sortedPieces = playerPieces.map((piece, idx) => ({ piece, idx }))
        .sort((a, b) => PIECES[a.piece.type].level - PIECES[b.piece.type].level || a.piece.type.localeCompare(b.piece.type));
    sortedPieces.forEach(({ piece, idx }) => pieceSupply.appendChild(createPieceElement(piece.type, idx, currentRotation, true, currentMirror, piece.expiry)));
    
    document.getElementById('points').textContent = points;
    document.getElementById('turns').textContent = totalTurns;
    document.getElementById('ppt').textContent = totalTurns > 0 ? (points / totalTurns).toFixed(2) : '0.00';
    document.getElementById('t1-solved').textContent = stats.tier1Solved;
    document.getElementById('t1-expired').textContent = stats.tier1Expired;
    document.getElementById('t2-solved').textContent = stats.tier2Solved;
    document.getElementById('t2-expired').textContent = stats.tier2Expired;
    
    // Show/hide return button based on selection
    const returnBtn = document.getElementById('return-btn');
    if (selectedPiece?.fromPuzzle) {
        returnBtn.classList.remove('hidden');
    } else {
        returnBtn.classList.add('hidden');
    }
    
    // Show undo button (always visible, disabled when no undo available)
    const undoBtn = document.getElementById('undo-btn');
    undoBtn.disabled = !lastPlacement;
    undoBtn.classList.remove('hidden');
    
    // Show/hide sacrifice button in advanced mode
    const sacrificeBtn = document.getElementById('sacrifice-btn');
    if (advancedMode) {
        sacrificeBtn.classList.remove('hidden');
        if (sacrificeMode) {
            sacrificeBtn.textContent = sacrificeSelection.length === 3 ? 'Confirm Sacrifice' : `Cancel (${sacrificeSelection.length}/3)`;
            sacrificeBtn.disabled = false;
        } else {
            sacrificeBtn.textContent = 'Sacrifice';
            sacrificeBtn.disabled = playerPieces.length < 3;
        }
    } else {
        sacrificeBtn.classList.add('hidden');
    }
    
    // Disable Take Dot at piece limit in advanced mode
    const takeDotBtn = document.getElementById('take-dot');
    const atLimit = advancedMode && playerPieces.length >= PIECE_LIMIT;
    takeDotBtn.disabled = atLimit;
    
    // Piece count warning
    const pieceCount = playerPieces.length;
    const pieceWarning = document.getElementById('piece-warning');
    if (advancedMode && pieceCount >= 10) {
        pieceWarning.textContent = `${pieceCount}/${PIECE_LIMIT} pieces`;
        pieceWarning.classList.remove('hidden');
        if (pieceCount >= PIECE_LIMIT) pieceWarning.classList.add('at-limit');
        else pieceWarning.classList.remove('at-limit');
    } else {
        pieceWarning.classList.add('hidden');
    }
    
    // Sync advanced mode button
    const advBtn = document.getElementById('advanced-toggle');
    advBtn.textContent = advancedMode ? '★ Advanced' : 'Standard';
    advBtn.className = advancedMode ? 'advanced-on' : 'advanced-off';
    advBtn.title = advancedMode ? 'Click to switch to Standard Mode' : 'Click to switch to Advanced Mode';
    
    renderHistory();
    saveGame();
}

// Generate easy puzzle (<=3 cells) for starting hand
function addEasyPuzzle() {
    for (let attempts = 0; attempts < 100; attempts++) {
        const targetCells = 2 + Math.floor(Math.random() * 2); // 2-3 cells
        const grid = generateRandomPuzzle(targetCells);
        if (!grid) continue;
        const cells = countCells(grid);
        if (cells < 2 || cells > 3) continue;
        
        const canonical = getCanonical(grid);
        if (seenPuzzles.has(canonical)) continue;
        
        seenPuzzles.add(canonical);
        puzzleSeq[1]++;
        
        const id = `T1-${String(puzzleSeq[1]).padStart(3, '0')}-${hashCode(canonical)}`;
        const puzzle = { id, grid, points: 0, reward: getReward(cells), tier: 1, placedPieces: [], turnsLeft: TIER1_TURNS, maxTurns: TIER1_TURNS };
        puzzleHistory.push({ id, grid: JSON.parse(JSON.stringify(grid)), tier: 1, cells, timestamp: Date.now(), status: 'active' });
        tier1Puzzles.push(puzzle);
        return;
    }
    addNewPuzzle(1); // fallback
}

// Initialize
if (!loadGame()) {
    addEasyPuzzle();
    for (let i = 0; i < 3; i++) addNewPuzzle(1);
    for (let i = 0; i < 4; i++) addNewPuzzle(2);
}
render();
showStorageConsent();

document.getElementById('take-dot').addEventListener('click', () => {
    addPieceToHand('dot');
    decrementAllTurns();
    render();
});

document.getElementById('sacrifice-btn').addEventListener('click', () => {
    if (!sacrificeMode) {
        // Enter sacrifice mode
        sacrificeMode = true;
        sacrificeSelection = [];
        selectedPiece = null;
        render();
        return;
    }
    
    if (sacrificeSelection.length < 3) {
        // Cancel sacrifice mode
        sacrificeMode = false;
        sacrificeSelection = [];
        render();
        return;
    }
    
    // Confirm sacrifice - get level of selected pieces
    const level = PIECES[playerPieces[sacrificeSelection[0]].type].level;
    
    // Remove selected pieces (reverse order to preserve indices)
    sacrificeSelection.sort((a, b) => b - a);
    for (const idx of sacrificeSelection) {
        playerPieces.splice(idx, 1);
    }
    
    // Add random piece of next level
    const nextLevelPieces = Object.keys(PIECES).filter(k => PIECES[k].level === level + 1);
    if (nextLevelPieces.length > 0) {
        const newPiece = nextLevelPieces[Math.floor(Math.random() * nextLevelPieces.length)];
        addPieceToHand(newPiece);
    }
    
    sacrificeMode = false;
    sacrificeSelection = [];
    decrementAllTurns();
    render();
});

document.getElementById('reset-game').addEventListener('click', resetGame);
document.getElementById('advanced-toggle').addEventListener('click', toggleAdvancedMode);
document.getElementById('accept-storage').addEventListener('click', acceptStorage);
document.getElementById('decline-storage').addEventListener('click', declineStorage);

document.getElementById('undo-btn').addEventListener('click', () => {
    if (!lastPlacement) return;
    
    const { tier, puzzleIndex, placedIndex, pieceType } = lastPlacement;
    const puzzleArray = tier === 1 ? tier1Puzzles : tier2Puzzles;
    const puzzle = puzzleArray[puzzleIndex];
    
    if (puzzle && puzzle.placedPieces[placedIndex]) {
        // Remove piece from puzzle
        puzzle.placedPieces.splice(placedIndex, 1);
        
        // Return piece to hand
        addPieceToHand(pieceType);
        
        // Refund turn in standard mode only
        if (!advancedMode) {
            totalTurns--;
            // Restore turns on all puzzles
            [...tier1Puzzles, ...tier2Puzzles].forEach(p => p.turnsLeft++);
            // Restore expiry on all pieces
            playerPieces.forEach(p => { if (p.expiry !== undefined) p.expiry++; });
        }
    }
    
    lastPlacement = null;
    render();
});

document.getElementById('rotate-btn').addEventListener('click', () => {
    currentRotation = (currentRotation + 1) % 4;
    render();
});

document.getElementById('mirror-btn').addEventListener('click', () => {
    currentMirror = !currentMirror;
    render();
});

function returnSelectedPiece() {
    if (!selectedPiece?.fromPuzzle) return;
    const { tier, puzzleIndex, placedIndex } = selectedPiece.fromPuzzle;
    const puzzleArray = tier === 1 ? tier1Puzzles : tier2Puzzles;
    const puzzle = puzzleArray[puzzleIndex];
    if (puzzle && puzzle.placedPieces[placedIndex]) {
        const placed = puzzle.placedPieces[placedIndex];
        addPieceToHand(placed.type);
        puzzle.placedPieces.splice(placedIndex, 1);
        selectedPiece = null;
        render();
    }
}

document.getElementById('return-btn').addEventListener('click', returnSelectedPiece);

// Click piece supply area to return selected piece from puzzle
document.getElementById('piece-supply').addEventListener('click', e => {
    if (e.target.id === 'piece-supply' && selectedPiece?.fromPuzzle) {
        returnSelectedPiece();
    }
});

// Drag piece to supply area to return it
const pieceSupply = document.getElementById('piece-supply');
pieceSupply.addEventListener('dragover', e => {
    if (draggedFromPuzzle) e.preventDefault();
});
pieceSupply.addEventListener('drop', e => {
    e.preventDefault();
    if (draggedFromPuzzle) {
        const { tier, puzzleIndex, placedIndex } = draggedFromPuzzle;
        const puzzleArray = tier === 1 ? tier1Puzzles : tier2Puzzles;
        const puzzle = puzzleArray[puzzleIndex];
        if (puzzle && puzzle.placedPieces[placedIndex]) {
            addPieceToHand(draggedPiece);
            puzzle.placedPieces.splice(placedIndex, 1);
        }
        draggedPiece = null;
        draggedFromPuzzle = null;
        render();
    }
});

document.getElementById('toggle-history').addEventListener('click', () => {
    const hist = document.getElementById('puzzle-history');
    const btn = document.getElementById('toggle-history');
    hist.classList.toggle('hidden');
    btn.textContent = hist.classList.contains('hidden') ? 'Show Puzzle History' : 'Hide Puzzle History';
    if (!hist.classList.contains('hidden')) renderHistory();
});

function renderHistory() {
    const container = document.getElementById('history-list');
    if (!container || document.getElementById('puzzle-history').classList.contains('hidden')) return;
    container.innerHTML = puzzleHistory.slice().reverse().map(p => {
        const gridStr = p.grid.map(r => r.map(c => c ? '█' : '·').join('')).join('<br>');
        const statusClass = p.status === 'solved' ? 'solved' : p.status === 'expired' ? 'expired' : 'active';
        const statusIcon = p.status === 'solved' ? '✓' : p.status === 'expired' ? '✗' : '●';
        return `<div class="history-item ${statusClass}"><strong>${statusIcon} ${p.id}</strong> (${p.cells} cells)<br><code>${gridStr}</code></div>`;
    }).join('');
}
