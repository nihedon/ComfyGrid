export function createGridBackgroundPaths(width: number, height: number, columns: number, cellHeight: number, mode: 'grid' | 'dots' = 'grid') {
    const major: string[] = [];
    const minor: string[] = [];
    if (![width, height, columns, cellHeight].every(Number.isFinite) || width <= 2 || height <= 2 || columns < 1 || cellHeight <= 0) {
        return { major: '', minor: '' };
    }

    // Only internal boundaries are guides; the board owns the outer border.
    for (let column = 1; column < columns; column++) {
        const x = (width * column) / columns;
        if (x <= 1 || x >= width - 1) continue;
        if (mode === 'dots') {
            for (let row = 1; row * cellHeight < height - 1; row++) {
                const y = row * cellHeight;
                if (y <= 1) continue;
                const target = row % 4 === 0 ? major : minor;
                // Round line caps turn zero-length segments into dots without one DOM element per point.
                target.push(`M ${x} ${y} h 0`);
            }
        } else {
            major.push(`M ${x} 0 V ${height}`);
        }
    }
    if (mode === 'dots') return { major: major.join(' '), minor: minor.join(' ') };
    for (let row = 1; row * cellHeight < height - 1; row++) {
        const target = row % 4 === 0 ? major : minor;
        target.push(`M 0 ${row * cellHeight} H ${width}`);
    }
    return { major: major.join(' '), minor: minor.join(' ') };
}
