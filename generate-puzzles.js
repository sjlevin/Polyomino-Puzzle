// Puzzle generator - run with: node generate-puzzles.js
// Generates unique puzzles for both tiers and writes to puzzles.js

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

function normalizeGrid(grid) {
    let g = grid.filter(row => row.some(c => c));
    if (g.length === 0) return '[]';
    const minCol = Math.min(...g.map(row => row.findIndex(c => c)).filter(i => i >= 0));
    const maxCol = Math.max(...g.map(row => row.lastIndexOf(1)));
    g = g.map(row => row.slice(minCol, maxCol + 1));
    return JSON.stringify(g);
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

function generateUniquePuzzles(minCells, maxCells, count, seen) {
    const puzzles = [];
    let attempts = 0;
    while (puzzles.length < count && attempts < count * 200) {
        attempts++;
        const targetCells = minCells + Math.floor(Math.random() * (maxCells - minCells + 1));
        const grid = generateRandomPuzzle(targetCells);
        if (!grid) continue;
        
        const cells = countCells(grid);
        if (cells < minCells || cells > maxCells) continue;
        
        const canonical = getCanonical(grid);
        if (seen.has(canonical)) continue;
        
        seen.add(canonical);
        puzzles.push({ grid, cells });
    }
    return puzzles.sort((a, b) => a.cells - b.cells);
}

// Piece rewards for tier 1 (no single dot - too easy)
const REWARDS = ['domino', 'tromino_i', 'tromino_l', 'tetro_i', 'tetro_o', 'tetro_t', 'tetro_s', 'tetro_l'];

function getReward(cells) {
    if (cells <= 2) return 'domino';
    if (cells <= 3) return REWARDS[1 + Math.floor(Math.random() * 2)];
    return REWARDS[3 + Math.floor(Math.random() * 5)];
}

// Generate both tiers (skip 1-cell puzzles)
const seen = new Set();

console.log('Generating Tier 1 puzzles (2-5 cells)...');
const tier1 = generateUniquePuzzles(2, 5, 15, seen);

console.log('Generating Tier 2 puzzles (6-14 cells)...');
const tier2 = generateUniquePuzzles(6, 14, 25, seen);

// Build output
let output = `// Auto-generated puzzles - do not edit manually
// Run 'node generate-puzzles.js' to regenerate

const TIER1_PUZZLES = [
`;

tier1.forEach((p, i) => {
    const reward = getReward(p.cells);
    const id = `T1-${String(i + 1).padStart(2, '0')}`;
    output += `    { id: '${id}', grid: ${JSON.stringify(p.grid)}, points: 0, reward: '${reward}' },\n`;
});

output += `];

const TIER2_PUZZLES = [
`;

tier2.forEach((p, i) => {
    const points = Math.floor(p.cells * 0.8);
    const id = `T2-${String(i + 1).padStart(2, '0')}`;
    output += `    { id: '${id}', grid: ${JSON.stringify(p.grid)}, points: ${points}, reward: null },\n`;
});

output += `];

if (typeof module !== 'undefined') module.exports = { TIER1_PUZZLES, TIER2_PUZZLES };
`;

// Write to file
const fs = require('fs');
fs.writeFileSync('puzzles.js', output);

console.log(`\n✓ Generated ${tier1.length} Tier 1 puzzles (2-5 cells)`);
console.log(`✓ Generated ${tier2.length} Tier 2 puzzles (6-14 cells)`);
console.log(`✓ Written to puzzles.js`);
