// Puzzle validator - run with: node validate-puzzles.js
// Validates puzzles.js for duplicates

const { TIER1_PUZZLES, TIER2_PUZZLES } = require('./puzzles.js');

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

function getAllVariants(grid) {
    const variants = new Set();
    let g = grid;
    for (let i = 0; i < 4; i++) {
        variants.add(normalizeGrid(g));
        variants.add(normalizeGrid(mirrorGrid(g)));
        g = rotateGrid(g);
    }
    return variants;
}

function findDuplicates(puzzles) {
    const seen = new Map();
    const duplicates = [];
    
    puzzles.forEach((puzzle, idx) => {
        const variants = getAllVariants(puzzle.grid);
        let foundMatch = null;
        for (const v of variants) {
            if (seen.has(v)) {
                foundMatch = seen.get(v);
                break;
            }
        }
        if (foundMatch !== null) {
            duplicates.push({ idx: idx + 1, duplicateOf: foundMatch + 1 });
        } else {
            for (const v of variants) {
                seen.set(v, idx);
            }
        }
    });
    
    return duplicates;
}

console.log('=== Checking Tier 1 Puzzles ===');
const t1Dups = findDuplicates(TIER1_PUZZLES);
if (t1Dups.length === 0) {
    console.log('✓ No duplicates found');
} else {
    t1Dups.forEach(d => console.log(`✗ Puzzle ${d.idx} is duplicate of puzzle ${d.duplicateOf}`));
}

console.log('\n=== Checking Tier 2 Puzzles ===');
const t2Dups = findDuplicates(TIER2_PUZZLES);
if (t2Dups.length === 0) {
    console.log('✓ No duplicates found');
} else {
    t2Dups.forEach(d => console.log(`✗ Puzzle ${d.idx} is duplicate of puzzle ${d.duplicateOf}`));
}

console.log(`\nTier 1: ${TIER1_PUZZLES.length - t1Dups.length} unique puzzles`);
console.log(`Tier 2: ${TIER2_PUZZLES.length - t2Dups.length} unique puzzles`);

// Exit with error if duplicates found
if (t1Dups.length > 0 || t2Dups.length > 0) {
    process.exit(1);
}
