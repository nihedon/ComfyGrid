export function createGridBackgroundPaths(width: number, height: number, columns: number, cellHeight: number) {
    const major: string[] = [];
    const minor: string[] = [];
    if (![width, height, columns, cellHeight].every(Number.isFinite) || width <= 2 || height <= 2 || columns < 1 || cellHeight <= 0) {
        return { major: '', minor: '' };
    }

    // Only internal boundaries are guides; the board owns the outer border.
    for (let column = 1; column < columns; column++) {
        const x = (width * column) / columns;
        if (x > 1 && x < width - 1) major.push(`M ${x} 0 V ${height}`);
    }
    for (let row = 1; row * cellHeight < height - 1; row++) {
        const target = row % 4 === 0 ? major : minor;
        target.push(`M 0 ${row * cellHeight} H ${width}`);
    }
    return { major: major.join(' '), minor: minor.join(' ') };
}
