// Unit tests - run with: node test.js

const assert = require('assert');

// Import game logic (we'll extract testable functions)
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

function getRotatedShape(shape, rotation, mirror = false) {
    let s = shape;
    for (let i = 0; i < rotation % 4; i++) s = rotateShape(s);
    if (mirror) s = mirrorShape(s);
    return s;
}

function canPlace(puzzle, shape, startRow, startCol, ignorePlacedIdx = -1) {
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[0].length; c++) {
            if (!shape[r][c]) continue;
            const pr = startRow + r, pc = startCol + c;
            if (pr < 0 || pr >= puzzle.grid.length || pc < 0 || pc >= puzzle.grid[0].length) return false;
            if (!puzzle.grid[pr][pc]) return false;
            const filled = puzzle.placedPieces.some((placed, idx) => {
                if (idx === ignorePlacedIdx) return false;
                const ps = getRotatedShape(placed.shape, placed.rotation, placed.mirror);
                return ps.some((row, psr) => row.some((cell, psc) => 
                    cell && placed.row + psr === pr && placed.col + psc === pc
                ));
            });
            if (filled) return false;
        }
    }
    return true;
}

function findBestPlacement(puzzle, shape, targetRow, targetCol, ignorePlacedIdx = -1) {
    const positions = [];
    for (let r = -shape.length + 1; r < puzzle.grid.length; r++) {
        for (let c = -shape[0].length + 1; c < puzzle.grid[0].length; c++) {
            if (canPlace(puzzle, shape, r, c, ignorePlacedIdx)) {
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

function countCells(grid) {
    return grid.flat().filter(c => c).length;
}

// Tests
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}`);
        console.log(`  ${e.message}`);
        failed++;
    }
}

console.log('=== Rotation Tests ===\n');

test('rotateShape: horizontal to vertical', () => {
    const h = [[1,1,1,1]];
    const v = rotateShape(h);
    assert.deepStrictEqual(v, [[1],[1],[1],[1]]);
});

test('rotateShape: L-piece rotates correctly', () => {
    const l = [[1,0],[1,0],[1,1]];
    const r1 = rotateShape(l);
    assert.deepStrictEqual(r1, [[1,1,1],[1,0,0]]);
});

test('rotateShape: 4 rotations returns to original', () => {
    const shape = [[1,1,0],[0,1,1]];
    let s = shape;
    for (let i = 0; i < 4; i++) s = rotateShape(s);
    assert.deepStrictEqual(s, shape);
});

test('mirrorShape: flips horizontally', () => {
    const l = [[1,0],[1,1]];
    const m = mirrorShape(l);
    assert.deepStrictEqual(m, [[0,1],[1,1]]);
});

test('getRotatedShape: rotation 0 returns original', () => {
    const shape = [[1,1,1]];
    assert.deepStrictEqual(getRotatedShape(shape, 0), shape);
});

test('getRotatedShape: rotation 1 rotates 90°', () => {
    const shape = [[1,1,1,1]];
    assert.deepStrictEqual(getRotatedShape(shape, 1), [[1],[1],[1],[1]]);
});

test('getRotatedShape: mirror after rotate (T-piece)', () => {
    // T-piece rotated 90° then mirrored should flip horizontally
    const tetro_t = [[1,1,1],[0,1,0]];
    const rot1 = getRotatedShape(tetro_t, 1, false);
    assert.deepStrictEqual(rot1, [[0,1],[1,1],[0,1]]);
    const rot1_mirror = getRotatedShape(tetro_t, 1, true);
    assert.deepStrictEqual(rot1_mirror, [[1,0],[1,1],[1,0]]);
});

test('getRotatedShape: S-piece mirror produces Z-piece', () => {
    const tetro_s = [[0,1,1],[1,1,0]];
    const mirrored = getRotatedShape(tetro_s, 0, true);
    assert.deepStrictEqual(mirrored, [[1,1,0],[0,1,1]]);
});

test('getRotatedShape: L-piece all rotations', () => {
    const tetro_l = [[1,0],[1,0],[1,1]];
    assert.deepStrictEqual(getRotatedShape(tetro_l, 0), [[1,0],[1,0],[1,1]]);
    assert.deepStrictEqual(getRotatedShape(tetro_l, 1), [[1,1,1],[1,0,0]]);
    assert.deepStrictEqual(getRotatedShape(tetro_l, 2), [[1,1],[0,1],[0,1]]);
    assert.deepStrictEqual(getRotatedShape(tetro_l, 3), [[0,0,1],[1,1,1]]);
});

test('getRotatedShape: L-piece mirrored all rotations', () => {
    const tetro_l = [[1,0],[1,0],[1,1]];
    assert.deepStrictEqual(getRotatedShape(tetro_l, 0, true), [[0,1],[0,1],[1,1]]);
    assert.deepStrictEqual(getRotatedShape(tetro_l, 1, true), [[1,1,1],[0,0,1]]);
    assert.deepStrictEqual(getRotatedShape(tetro_l, 2, true), [[1,1],[1,0],[1,0]]);
    assert.deepStrictEqual(getRotatedShape(tetro_l, 3, true), [[1,0,0],[1,1,1]]);
});

test('getRotatedShape: rotation 4 same as 0', () => {
    const shape = [[1,1,0],[0,1,1]];
    assert.deepStrictEqual(getRotatedShape(shape, 4), getRotatedShape(shape, 0));
    assert.deepStrictEqual(getRotatedShape(shape, 4, true), getRotatedShape(shape, 0, true));
});

console.log('\n=== Placement Tests ===\n');

test('canPlace: piece fits in empty puzzle', () => {
    const puzzle = { grid: [[1,1,1,1]], placedPieces: [] };
    const shape = [[1,1,1,1]];
    assert.strictEqual(canPlace(puzzle, shape, 0, 0), true);
});

test('canPlace: piece too big for puzzle', () => {
    const puzzle = { grid: [[1,1,1]], placedPieces: [] };
    const shape = [[1,1,1,1]];
    assert.strictEqual(canPlace(puzzle, shape, 0, 0), false);
});

test('canPlace: piece overlaps solid area', () => {
    const puzzle = { grid: [[1,0,1]], placedPieces: [] };
    const shape = [[1,1,1]];
    assert.strictEqual(canPlace(puzzle, shape, 0, 0), false);
});

test('canPlace: piece overlaps placed piece', () => {
    const puzzle = { 
        grid: [[1,1,1,1]], 
        placedPieces: [{ shape: [[1,1]], rotation: 0, mirror: false, row: 0, col: 0 }]
    };
    const shape = [[1,1]];
    assert.strictEqual(canPlace(puzzle, shape, 0, 0), false);
    assert.strictEqual(canPlace(puzzle, shape, 0, 2), true);
});

test('canPlace: ignorePlacedIdx allows overlap with self', () => {
    const puzzle = { 
        grid: [[1,1,1,1]], 
        placedPieces: [{ shape: [[1,1]], rotation: 0, mirror: false, row: 0, col: 0 }]
    };
    const shape = [[1,1]];
    assert.strictEqual(canPlace(puzzle, shape, 0, 0, 0), true);
    assert.strictEqual(canPlace(puzzle, shape, 0, 1, 0), true);
});

test('canPlace: vertical piece in vertical puzzle', () => {
    const puzzle = { grid: [[1],[1],[1],[1]], placedPieces: [] };
    const shape = [[1],[1],[1],[1]];
    assert.strictEqual(canPlace(puzzle, shape, 0, 0), true);
});

test('canPlace: horizontal piece cannot fit in vertical puzzle', () => {
    const puzzle = { grid: [[1],[1],[1],[1]], placedPieces: [] };
    const shape = [[1,1,1,1]];
    assert.strictEqual(canPlace(puzzle, shape, 0, 0), false);
});

console.log('\n=== Snap-to-Grid Tests ===\n');

test('findBestPlacement: finds exact position', () => {
    const puzzle = { grid: [[1,1,1,1]], placedPieces: [] };
    const shape = [[1,1]];
    const result = findBestPlacement(puzzle, shape, 0, 0);
    assert.deepStrictEqual(result, { row: 0, col: 0, dist: 0 });
});

test('findBestPlacement: snaps to nearest valid position', () => {
    const puzzle = { grid: [[1,1,1,1]], placedPieces: [] };
    const shape = [[1,1]];
    // Target col 3, but piece is 2 wide, so best is col 2
    const result = findBestPlacement(puzzle, shape, 0, 3);
    assert.strictEqual(result.col, 2);
});

test('findBestPlacement: returns null when no valid position', () => {
    const puzzle = { grid: [[1,1]], placedPieces: [] };
    const shape = [[1,1,1,1]];
    const result = findBestPlacement(puzzle, shape, 0, 0);
    assert.strictEqual(result, null);
});

test('findBestPlacement: avoids placed pieces', () => {
    const puzzle = { 
        grid: [[1,1,1,1]], 
        placedPieces: [{ shape: [[1,1]], rotation: 0, mirror: false, row: 0, col: 0 }]
    };
    const shape = [[1,1]];
    const result = findBestPlacement(puzzle, shape, 0, 0);
    assert.strictEqual(result.col, 2); // Must go to col 2
});

test('findBestPlacement: can overlap self when moving', () => {
    const puzzle = { 
        grid: [[1,1,1,1]], 
        placedPieces: [{ shape: [[1,1]], rotation: 0, mirror: false, row: 0, col: 0 }]
    };
    const shape = [[1,1]];
    const result = findBestPlacement(puzzle, shape, 0, 1, 0); // ignorePlacedIdx=0
    assert.strictEqual(result.col, 0); // Can stay at col 0 (closest to target col 1)
});

console.log('\n=== Cell Counting Tests ===\n');

test('countCells: counts filled cells', () => {
    assert.strictEqual(countCells([[1,1,1,1]]), 4);
    assert.strictEqual(countCells([[1,0],[1,1]]), 3);
    assert.strictEqual(countCells([[1,0,1],[0,1,0]]), 3);
});

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
