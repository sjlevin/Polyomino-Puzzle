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

// Puzzle definitions: grid where 1=empty space to fill
// Tier 1: 0 points, rewards a piece (unique shapes only)
const TIER1_PUZZLES = [
    { grid: [[1]], points: 0, reward: 'dot' },
    { grid: [[1,1]], points: 0, reward: 'domino' },
    { grid: [[1,1,1]], points: 0, reward: 'tromino_i' },
    { grid: [[1,0],[1,1]], points: 0, reward: 'tromino_l' },
    { grid: [[1,1,1,1]], points: 0, reward: 'tetro_i' },
    { grid: [[1,1],[1,1]], points: 0, reward: 'tetro_o' },
    { grid: [[1,1,1],[0,1,0]], points: 0, reward: 'tetro_t' },
    { grid: [[0,1,1],[1,1,0]], points: 0, reward: 'tetro_s' },
    { grid: [[1,0],[1,0],[1,1]], points: 0, reward: 'tetro_l' },
    { grid: [[1,1,1],[1,0,0]], points: 0, reward: 'tromino_l' },
    { grid: [[1,1],[1,0],[1,0]], points: 0, reward: 'tromino_i' },
    { grid: [[1,1,0],[0,1,1]], points: 0, reward: 'tetro_s' },
    { grid: [[1,1],[1,1],[1,0]], points: 0, reward: 'tetro_l' }, // square + 1
    { grid: [[1,1,1],[1,1,0]], points: 0, reward: 'tetro_t' }, // square + 1
    { grid: [[1,1],[1,1],[0,1]], points: 0, reward: 'tetro_o' }, // square + 1
];

// Tier 2: points, no piece reward - unique interesting shapes
const TIER2_PUZZLES = [
    { grid: [[1,1,1,1,1,1]], points: 4, reward: null }, // long line
    { grid: [[1,1,0],[0,1,0],[0,1,1],[0,0,1]], points: 5, reward: null }, // zigzag
    { grid: [[1,1,1],[0,0,1],[1,1,1]], points: 5, reward: null }, // S shape
    { grid: [[1,0,1],[1,1,1],[1,0,1]], points: 6, reward: null }, // plus with corners
    { grid: [[1,1,0,0],[0,1,1,0],[0,0,1,1]], points: 6, reward: null }, // diagonal steps
    { grid: [[1,1,1,1],[1,0,0,0],[1,1,1,1]], points: 7, reward: null }, // C shape
    { grid: [[1,0,0,1],[1,1,1,1],[1,0,0,1]], points: 7, reward: null }, // H shape
    { grid: [[0,1,0],[1,1,1],[0,1,0],[1,1,1],[0,1,0]], points: 8, reward: null }, // totem
    { grid: [[1,1,0,1,1],[0,1,1,1,0]], points: 8, reward: null }, // bow tie
    { grid: [[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1]], points: 9, reward: null }, // wide H
    { grid: [[1,1,1],[1,0,1],[1,0,1],[1,1,1]], points: 9, reward: null }, // frame
    { grid: [[0,0,1],[0,1,1],[1,1,0],[1,0,0],[1,1,1]], points: 10, reward: null }, // snake
    { grid: [[1,0,1,0,1],[1,1,1,1,1],[1,0,1,0,1]], points: 12, reward: null }, // comb
    { grid: [[1,1,0],[1,1,0],[1,1,1]], points: 6, reward: null }, // square + L
    { grid: [[1,1,1],[1,1,1],[0,0,1]], points: 6, reward: null }, // square + corner
    { grid: [[1,1,0,0],[1,1,0,0],[1,1,1,1]], points: 8, reward: null }, // double square + line
    { grid: [[1,1,1,1],[1,1,0,0],[1,1,0,0]], points: 8, reward: null }, // square + bar
    { grid: [[1,1,0],[1,1,0],[0,1,1],[0,1,1]], points: 8, reward: null }, // two squares diagonal
    { grid: [[1,1,1],[1,1,1],[1,1,0]], points: 7, reward: null }, // big square minus corner
];

let playerPieces = ['dot', 'domino'];
let tier1Puzzles = [];
let tier2Puzzles = [];
let tier1Recent = []; // indices of recently used puzzles
let tier2Recent = [];
let points = 0;
let draggedPiece = null;
let draggedIndex = null;
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

function createPuzzleElement(puzzle, index, tier) {
    const el = document.createElement('div');
    el.className = 'puzzle';
    el.dataset.index = index;
    el.dataset.tier = tier;
    
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
    
    displayGrid.flat().forEach(state => {
        const cellEl = document.createElement('div');
        cellEl.className = 'cell ' + state;
        grid.appendChild(cellEl);
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
    
    el.appendChild(grid);
    el.appendChild(info);
    
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => {
        e.preventDefault();
        el.classList.remove('drag-over');
        tryPlacePiece(tier, index);
    });
    
    return el;
}

function canPlace(puzzle, shape, startRow, startCol) {
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[0].length; c++) {
            if (!shape[r][c]) continue;
            const pr = startRow + r, pc = startCol + c;
            if (pr < 0 || pr >= puzzle.grid.length || pc < 0 || pc >= puzzle.grid[0].length) return false;
            if (!puzzle.grid[pr][pc]) return false; // solid area
            // Check if already filled
            const filled = puzzle.placedPieces.some(placed => {
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

function tryPlacePiece(tier, puzzleIndex) {
    if (draggedPiece === null || draggedIndex === null) return;
    
    const puzzleArray = tier === 1 ? tier1Puzzles : tier2Puzzles;
    const puzzle = puzzleArray[puzzleIndex];
    const shape = getRotatedShape(draggedPiece, currentRotation, currentMirror);
    const placement = findPlacement(puzzle, shape);
    
    if (placement) {
        puzzle.placedPieces.push({ type: draggedPiece, rotation: currentRotation, mirror: currentMirror, ...placement });
        playerPieces.splice(draggedIndex, 1);
        
        // Check completion
        const totalEmpty = puzzle.grid.flat().filter(c => c).length;
        const totalFilled = puzzle.placedPieces.reduce((sum, p) => 
            sum + getRotatedShape(p.type, p.rotation, p.mirror).flat().filter(c => c).length, 0);
        
        if (totalFilled >= totalEmpty) {
            points += puzzle.points;
            // Refund all placed pieces
            puzzle.placedPieces.forEach(p => playerPieces.push(p.type));
            // Add reward piece if tier 1
            if (puzzle.reward) playerPieces.push(puzzle.reward);
            puzzleArray.splice(puzzleIndex, 1);
            addNewPuzzle(tier);
        }
        render();
    }
    
    draggedPiece = null;
    draggedIndex = null;
}

function addNewPuzzle(tier) {
    const puzzles = tier === 1 ? TIER1_PUZZLES : TIER2_PUZZLES;
    const target = tier === 1 ? tier1Puzzles : tier2Puzzles;
    const recent = tier === 1 ? tier1Recent : tier2Recent;
    
    // Get indices currently in use
    const inUse = target.map(p => p.sourceIndex);
    // Available = not in use and not in recent
    const available = puzzles.map((_, i) => i).filter(i => !inUse.includes(i) && !recent.includes(i));
    
    // Pick random from available, or from all non-in-use if none available
    const pool = available.length > 0 ? available : puzzles.map((_, i) => i).filter(i => !inUse.includes(i));
    const idx = pool[Math.floor(Math.random() * pool.length)];
    
    target.push({ ...puzzles[idx], tier, sourceIndex: idx, placedPieces: [] });
    
    // Track in recent, keep only last 5
    recent.push(idx);
    if (recent.length > 5) recent.shift();
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
    const sortedPieces = [...playerPieces].sort((a, b) => PIECES[a].level - PIECES[b].level || a.localeCompare(b));
    sortedPieces.forEach((type, i) => pieceSupply.appendChild(createPieceElement(type, playerPieces.indexOf(type), currentRotation, true, currentMirror)));
    
    document.getElementById('points').textContent = points;
}

// Initialize with 4 of each tier
for (let i = 0; i < 4; i++) addNewPuzzle(1);
for (let i = 0; i < 4; i++) addNewPuzzle(2);
render();
