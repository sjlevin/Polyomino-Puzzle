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

const REWARDS = ['domino', 'tromino_i', 'tromino_l', 'tetro_i', 'tetro_o', 'tetro_t', 'tetro_s', 'tetro_l'];

let playerPieces = ['dot', 'domino'];
let tier1Puzzles = [];
let tier2Puzzles = [];
let seenPuzzles = new Set(); // canonical forms of all generated puzzles
let puzzleHistory = [];
let puzzleSeq = { 1: 0, 2: 0 };

const TIER1_TURNS = 8;
const TIER2_TURNS = 12;
let points = 0;
let totalTurns = 0;
let stats = { tier1Solved: 0, tier1Expired: 0, tier2Solved: 0, tier2Expired: 0 };
let draggedPiece = null;
let draggedIndex = null;
let draggedFromPuzzle = null;
let currentRotation = 0;
let currentMirror = false;
let selectedPiece = null; // { type, index, fromPuzzle? } for touch-based selection
let touchStartTime = 0;

// Puzzle generation
function generateRandomPuzzle(targetCells) {
    const maxDim = Math.min(6, targetCells);
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
    const [minCells, maxCells] = tier === 1 ? [2, 5] : [6, 14];
    const maxTurns = tier === 1 ? TIER1_TURNS : TIER2_TURNS;
    
    for (let attempts = 0; attempts < 500; attempts++) {
        const targetCells = minCells + Math.floor(Math.random() * (maxCells - minCells + 1));
        const grid = generateRandomPuzzle(targetCells);
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
        
        const puzzle = { id, grid, points: pts, reward, tier, placedPieces: [], turnsLeft: maxTurns, maxTurns };
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
    
    // Highlight selected piece for touch
    if (isSupply && selectedPiece && selectedPiece.type === type && selectedPiece.index === index) {
        el.classList.add('selected');
    }
    
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
        
        // Touch support - tap to select/rotate, long-press to mirror
        el.addEventListener('touchstart', e => {
            touchStartTime = Date.now();
        }, { passive: true });
        el.addEventListener('touchend', e => {
            e.preventDefault();
            const duration = Date.now() - touchStartTime;
            if (duration > 400) {
                // Long press = mirror
                currentMirror = !currentMirror;
            } else if (selectedPiece && selectedPiece.type === type && selectedPiece.index === index) {
                // Tap selected piece = rotate
                currentRotation = (currentRotation + 1) % 4;
            } else {
                // Tap unselected piece = select it
                selectedPiece = { type, index };
            }
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
    const gridStr = puzzle.grid.map(r => r.map(c => c ? '█' : '·').join('')).join('\n');
    el.title = `${puzzle.id}\nSize: ${puzzle.grid[0].length}x${puzzle.grid.length} (${cells} cells)\nPlaced: ${placed}\nTurns: ${puzzle.turnsLeft}/${puzzle.maxTurns}\n\n${gridStr}`;
    
    const grid = document.createElement('div');
    grid.className = 'puzzle-grid';
    grid.style.gridTemplateColumns = `repeat(${puzzle.grid[0].length}, 1fr)`;
    
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
            
            // Touch support - tap to place selected piece
            cellEl.addEventListener('touchend', e => {
                e.preventDefault();
                if (selectedPiece) {
                    draggedPiece = selectedPiece.type;
                    draggedIndex = selectedPiece.index;
                    draggedFromPuzzle = null;
                    const shape = getRotatedShape(draggedPiece, currentRotation, currentMirror);
                    const best = findBestPlacement(puzzle, shape, r, c);
                    if (best) {
                        tryPlacePieceAt(tier, index, best.row, best.col);
                        selectedPiece = null;
                    }
                } else if (state === 'filled') {
                    // Tap placed piece to pick it up
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
            });
            
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
    
    // Check for touch-based move from puzzle
    const fromPuzzle = draggedFromPuzzle || (selectedPiece && selectedPiece.fromPuzzle);
    
    // Check if moving within same puzzle
    const isMovingWithinSamePuzzle = fromPuzzle && 
        fromPuzzle.tier === tier && 
        fromPuzzle.puzzleIndex === puzzleIndex;
    
    const ignorePlacedIdx = isMovingWithinSamePuzzle ? fromPuzzle.placedIndex : -1;
    
    if (canPlace(puzzle, shape, row, col, ignorePlacedIdx)) {
        // Remove from source
        if (fromPuzzle) {
            const srcArray = fromPuzzle.tier === 1 ? tier1Puzzles : tier2Puzzles;
            srcArray[fromPuzzle.puzzleIndex].placedPieces.splice(fromPuzzle.placedIndex, 1);
        } else if (draggedIndex !== null) {
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
            updatePuzzleStatus(puzzle.id, 'solved');
            puzzleArray.splice(puzzleIndex, 1);
            addNewPuzzle(tier);
            selectedPiece = null;
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
                // Puzzle expired - refund pieces
                puzzles[i].placedPieces.forEach(p => playerPieces.push(p.type));
                if (tier === 1) stats.tier1Expired++;
                else stats.tier2Expired++;
                updatePuzzleStatus(puzzles[i].id, 'expired');
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
    
    renderHistory();
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
addEasyPuzzle();
for (let i = 0; i < 3; i++) addNewPuzzle(1);
for (let i = 0; i < 4; i++) addNewPuzzle(2);
render();

document.getElementById('take-dot').addEventListener('click', () => {
    playerPieces.push('dot');
    decrementAllTurns();
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
