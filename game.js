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
};

// TIER1_PUZZLES and TIER2_PUZZLES loaded from puzzles.js

let playerPieces = ['dot', 'domino'];
let tier1Puzzles = [];
let tier2Puzzles = [];
let tier1Recent = []; // indices of recently used puzzles
let tier2Recent = [];

const TIER1_TURNS = 8;
const TIER2_TURNS = 12;
let points = 0;
let totalTurns = 0;
let stats = { tier1Solved: 0, tier1Expired: 0, tier2Solved: 0, tier2Expired: 0 };
let draggedPiece = null;
let draggedIndex = null;
let draggedFromPuzzle = null; // { tier, puzzleIndex, placedIndex } when moving within puzzle
let currentRotation = 0;
let currentMirror = false;

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
    if (mirror) shape = mirrorShape(shape);
    for (let i = 0; i < rotation % 4; i++) shape = rotateShape(shape);
    return shape;
}

function createPieceElement(type, index, rotation = 0, isSupply = true, mirror = false) {
    const shape = getRotatedShape(type, rotation, mirror);
    const baseShape = PIECES[type].shape;
    const maxDim = Math.max(baseShape.length, baseShape[0].length);
    
    const el = document.createElement('div');
    el.className = 'piece';
    
    // Debug tooltip
    const piece = PIECES[type];
    const cellCount = piece.shape.flat().filter(c => c).length;
    el.title = `${type}\nLevel: ${piece.level}\nCells: ${cellCount}\nRotation: ${rotation * 90}°\nMirrored: ${mirror}`;
    
    if (isSupply) {
        el.draggable = true;
        el.dataset.type = type;
        el.dataset.index = index;
        el.style.width = (maxDim * 21) + 'px';
        el.style.height = (maxDim * 21) + 'px';
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
    
    if (isSupply) {
        el.addEventListener('dragstart', e => {
            draggedPiece = type;
            draggedIndex = index;
            el.classList.add('dragging');
        });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
        el.addEventListener('click', () => {
            currentRotation = (currentRotation + 1) % 4;
            render();
        });
        el.addEventListener('contextmenu', e => {
            e.preventDefault();
            currentMirror = !currentMirror;
            render();
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
    
    // Debug tooltip
    const cells = puzzle.grid.flat().filter(c => c).length;
    const placed = puzzle.placedPieces.map(p => p.type).join(', ') || 'none';
    el.title = `${puzzle.id || 'unknown'}\nCells: ${cells}\nPlaced: ${placed}\nTurns: ${puzzle.turnsLeft}/${puzzle.maxTurns}`;
    
    const grid = document.createElement('div');
    grid.className = 'puzzle-grid';
    grid.style.gridTemplateColumns = `repeat(${puzzle.grid[0].length}, 30px)`;
    
    // Build display grid with placed pieces
    const displayGrid = puzzle.grid.map(row => row.map(c => c ? 'empty' : 'solid'));
    puzzle.placedPieces.forEach(placed => {
        const shape = getRotatedShape(placed.type, placed.rotation, placed.mirror);
        shape.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell && displayGrid[placed.row + r] && displayGrid[placed.row + r][placed.col + c] !== undefined) {
                    displayGrid[placed.row + r][placed.col + c] = 'filled';
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
            
            // Make filled cells draggable to move pieces
            if (state === 'filled') {
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
                        currentRotation = placed.rotation;
                        currentMirror = placed.mirror;
                        draggedFromPuzzle = { tier, puzzleIndex: index, placedIndex: placedIdx };
                    }
                });
            }
            
            // Each cell is a drop target
            cellEl.addEventListener('dragover', e => {
                e.preventDefault();
                if (draggedPiece === null) return;
                const shape = getRotatedShape(draggedPiece, currentRotation, currentMirror);
                clearPreview(grid);
                showPreview(grid, puzzle, shape, r, c, draggedFromPuzzle?.placedIndex);
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
            
            grid.appendChild(cellEl);
        });
    });
    
    const info = document.createElement('div');
    info.className = 'puzzle-info';
    info.innerHTML = puzzle.reward ? '' : `${puzzle.points} pts`;
    
    // Add reward piece preview for tier 1
    if (puzzle.reward) {
        const rewardEl = createPieceElement(puzzle.reward, -1, 0, false);
        rewardEl.classList.add('reward-preview');
        info.appendChild(rewardEl);
    }
    
    // Add timer
    const timerContainer = document.createElement('div');
    timerContainer.className = 'timer-container';
    timerContainer.innerHTML = createTimerSVG(puzzle.turnsLeft, puzzle.maxTurns);
    
    el.appendChild(grid);
    el.appendChild(info);
    el.appendChild(timerContainer);
    
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

function findBestPlacement(puzzle, shape, targetRow, targetCol, ignorePlacedIdx = -1) {
    // Try positions in order of distance from target cell
    const positions = [];
    for (let r = -shape.length + 1; r < puzzle.grid.length; r++) {
        for (let c = -shape[0].length + 1; c < puzzle.grid[0].length; c++) {
            if (canPlace(puzzle, shape, r, c, ignorePlacedIdx)) {
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

function showPreview(grid, puzzle, shape, startRow, startCol, ignorePlacedIdx = -1) {
    const cols = puzzle.grid[0].length;
    const best = findBestPlacement(puzzle, shape, startRow, startCol, ignorePlacedIdx);
    
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

function canPlace(puzzle, shape, startRow, startCol, ignorePlacedIdx = -1) {
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[0].length; c++) {
            if (!shape[r][c]) continue;
            const pr = startRow + r, pc = startCol + c;
            if (pr < 0 || pr >= puzzle.grid.length || pc < 0 || pc >= puzzle.grid[0].length) return false;
            if (!puzzle.grid[pr][pc]) return false; // solid area
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
    
    // Check if moving within same puzzle
    const isMovingWithinSamePuzzle = draggedFromPuzzle && 
        draggedFromPuzzle.tier === tier && 
        draggedFromPuzzle.puzzleIndex === puzzleIndex;
    
    const ignorePlacedIdx = isMovingWithinSamePuzzle ? draggedFromPuzzle.placedIndex : -1;
    
    if (canPlace(puzzle, shape, row, col, ignorePlacedIdx)) {
        // Remove from source
        if (draggedFromPuzzle) {
            const srcArray = draggedFromPuzzle.tier === 1 ? tier1Puzzles : tier2Puzzles;
            srcArray[draggedFromPuzzle.puzzleIndex].placedPieces.splice(draggedFromPuzzle.placedIndex, 1);
        } else {
            playerPieces.splice(draggedIndex, 1);
        }
        
        // Add to target
        puzzle.placedPieces.push({ type: draggedPiece, rotation: currentRotation, mirror: currentMirror, row, col });
        
        // Only decrement turns if NOT moving within same puzzle
        if (!isMovingWithinSamePuzzle) {
            decrementAllTurns();
        }
        
        // Check completion
        const totalEmpty = puzzle.grid.flat().filter(c => c).length;
        const totalFilled = puzzle.placedPieces.reduce((sum, p) => 
            sum + getRotatedShape(p.type, p.rotation, p.mirror).flat().filter(c => c).length, 0);
        
        if (totalFilled >= totalEmpty) {
            points += puzzle.points;
            puzzle.placedPieces.forEach(p => playerPieces.push(p.type));
            if (puzzle.reward) playerPieces.push(puzzle.reward);
            if (tier === 1) stats.tier1Solved++;
            else stats.tier2Solved++;
            puzzleArray.splice(puzzleIndex, 1);
            addNewPuzzle(tier);
        }
        render();
    }
    
    draggedPiece = null;
    draggedIndex = null;
    draggedFromPuzzle = null;
}

function addNewPuzzle(tier) {
    const puzzles = tier === 1 ? TIER1_PUZZLES : TIER2_PUZZLES;
    const target = tier === 1 ? tier1Puzzles : tier2Puzzles;
    const recent = tier === 1 ? tier1Recent : tier2Recent;
    const maxTurns = tier === 1 ? TIER1_TURNS : TIER2_TURNS;
    
    // Get indices currently in use
    const inUse = target.map(p => p.sourceIndex);
    // Available = not in use and not in recent
    const available = puzzles.map((_, i) => i).filter(i => !inUse.includes(i) && !recent.includes(i));
    
    // Pick random from available, or from all non-in-use if none available
    const pool = available.length > 0 ? available : puzzles.map((_, i) => i).filter(i => !inUse.includes(i));
    const idx = pool[Math.floor(Math.random() * pool.length)];
    
    target.push({ ...puzzles[idx], tier, sourceIndex: idx, placedPieces: [], turnsLeft: maxTurns, maxTurns, id: puzzles[idx].id });
    
    // Track in recent, keep only last 5
    recent.push(idx);
    if (recent.length > 5) recent.shift();
}

function decrementAllTurns() {
    totalTurns++;
    [tier1Puzzles, tier2Puzzles].forEach((puzzles, tierIdx) => {
        const tier = tierIdx + 1;
        for (let i = puzzles.length - 1; i >= 0; i--) {
            puzzles[i].turnsLeft--;
            if (puzzles[i].turnsLeft <= 0) {
                // Puzzle expired - refund pieces
                puzzles[i].placedPieces.forEach(p => playerPieces.push(p.type));
                if (tier === 1) stats.tier1Expired++;
                else stats.tier2Expired++;
                puzzles.splice(i, 1);
                addNewPuzzle(tier);
            }
        }
    });
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
    const sortedPieces = playerPieces.map((type, idx) => ({ type, idx }))
        .sort((a, b) => PIECES[a.type].level - PIECES[b.type].level || a.type.localeCompare(b.type));
    sortedPieces.forEach(({ type, idx }) => pieceSupply.appendChild(createPieceElement(type, idx, currentRotation, true, currentMirror)));
    
    document.getElementById('points').textContent = points;
    document.getElementById('turns').textContent = totalTurns;
    document.getElementById('ppt').textContent = totalTurns > 0 ? (points / totalTurns).toFixed(2) : '0.00';
    document.getElementById('t1-solved').textContent = stats.tier1Solved;
    document.getElementById('t1-expired').textContent = stats.tier1Expired;
    document.getElementById('t2-solved').textContent = stats.tier2Solved;
    document.getElementById('t2-expired').textContent = stats.tier2Expired;
}

// Initialize with 4 of each tier, ensuring at least one easy T1 puzzle
function addEasyPuzzle() {
    // Find puzzles with <= 3 cells (solvable with dot + domino)
    const easyIndices = TIER1_PUZZLES.map((p, i) => ({ i, cells: p.grid.flat().filter(c => c).length }))
        .filter(p => p.cells <= 3)
        .map(p => p.i);
    const idx = easyIndices[Math.floor(Math.random() * easyIndices.length)];
    tier1Puzzles.push({ ...TIER1_PUZZLES[idx], tier: 1, sourceIndex: idx, placedPieces: [], turnsLeft: TIER1_TURNS, maxTurns: TIER1_TURNS, id: TIER1_PUZZLES[idx].id });
    tier1Recent.push(idx);
}

addEasyPuzzle();
for (let i = 0; i < 3; i++) addNewPuzzle(1);
for (let i = 0; i < 4; i++) addNewPuzzle(2);
render();

document.getElementById('take-dot').addEventListener('click', () => {
    playerPieces.push('dot');
    decrementAllTurns();
    render();
});
