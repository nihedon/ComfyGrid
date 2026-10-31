export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
    metadata: { type: 'obj' | 'text'; text: string; desc: string; palette: string[] };
}

export type BoxHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type BoxGeometryField = 'x' | 'y' | 'width' | 'height';
export interface BoxSelectionClick {
    index: number;
    clientX: number;
    clientY: number;
}

export function canCycleBoxes(previous: BoxSelectionClick | null, selected: number, clientX: number, clientY: number): boolean {
    return previous !== null && previous.index === selected && Math.hypot(clientX - previous.clientX, clientY - previous.clientY) < 10;
}
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function boxNumberTextColor(color: string): '#000000' | '#ffffff' {
    const hex = color.replace(/^#/, '');
    if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return boxNumberTextColor('#888888');
    const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const linear = [0, 2, 4].map((offset) => {
        const value = parseInt(expanded.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return luminance > 0.3 ? '#000000' : '#ffffff';
}

export function boxTypeFromText(text: string): 'obj' | 'text' {
    return text.trim() ? 'text' : 'obj';
}

export function snapBoxCoordinate(value: number, size: number): number {
    const spacing = Math.max(32, Math.ceil(size / 64));
    return clamp(Math.round(value / spacing) * spacing, 0, size);
}

export function readBoxes(value: unknown): BoundingBox[] | null {
    if (!Array.isArray(value)) return null;
    const result: BoundingBox[] = [];
    for (const box of value) {
        if (!box || !['x', 'y', 'width', 'height'].every((key) => typeof box[key] === 'number' && Number.isFinite(box[key]))) return null;
        result.push({
            ...box,
            metadata: {
                ...box.metadata,
                type: boxTypeFromText(typeof box.metadata?.text === 'string' ? box.metadata.text : ''),
                text: typeof box.metadata?.text === 'string' ? box.metadata.text : '',
                desc: typeof box.metadata?.desc === 'string' ? box.metadata.desc : '',
                palette: Array.isArray(box.metadata?.palette) ? box.metadata.palette.filter((color: unknown) => typeof color === 'string').slice(0, 5) : [],
            },
        });
    }
    return result;
}

export function cloneBoxes(boxes: BoundingBox[]): BoundingBox[] {
    return boxes.map((box) => ({ ...box, metadata: { ...box.metadata, palette: [...box.metadata.palette] } }));
}

export function boxesToJson(boxes: BoundingBox[]) {
    return boxes.map(({ x, y, width, height, metadata }) => ({
        type: boxTypeFromText(metadata.text),
        bbox: [x, y, x + width, y + height],
        ...(metadata.text ? { text: metadata.text } : {}),
        desc: metadata.desc,
        ...(metadata.palette.length ? { color_palette: [...metadata.palette] } : {}),
    }));
}

export function boxesFromJson(value: unknown): BoundingBox[] | null {
    if (!Array.isArray(value)) return null;
    const boxes: BoundingBox[] = [];
    for (const item of value) {
        if (
            !item ||
            !['obj', 'text'].includes(item.type) ||
            typeof item.desc !== 'string' ||
            !Array.isArray(item.bbox) ||
            item.bbox.length !== 4 ||
            !item.bbox.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) ||
            (item.text !== undefined && typeof item.text !== 'string') ||
            (item.color_palette !== undefined &&
                (!Array.isArray(item.color_palette) ||
                    item.color_palette.length > 5 ||
                    !item.color_palette.every((color: unknown) => typeof color === 'string')))
        )
            return null;
        const [x, y, right, bottom] = item.bbox;
        const width = right - x,
            height = bottom - y;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
        boxes.push({
            x,
            y,
            width,
            height,
            metadata: { type: boxTypeFromText(item.text ?? ''), desc: item.desc, text: item.text ?? '', palette: [...(item.color_palette ?? [])] },
        });
    }
    return boxes;
}

export function emptyBox(x: number, y: number): BoundingBox {
    return { x, y, width: 0, height: 0, metadata: { type: 'obj', text: '', desc: '', palette: [] } };
}

export function boxesToClipboard(boxes: BoundingBox[]): string {
    return JSON.stringify({ format: 'comfygrid/bounding-boxes', version: 1, boxes: boxesToJson(boxes) }, null, 2);
}

export function boxesFromClipboard(text: string): BoundingBox[] | null {
    try {
        const value = JSON.parse(text);
        if (value?.format !== 'comfygrid/bounding-boxes' || value.version !== 1) return null;
        const boxes = boxesFromJson(value.boxes);
        return boxes?.length ? boxes : null;
    } catch {
        return null;
    }
}

export function boxHits(boxes: BoundingBox[], x: number, y: number): number[] {
    const hits: number[] = [];
    for (let i = boxes.length - 1; i >= 0; i--) {
        const box = boxes[i];
        if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) hits.push(i);
    }
    const distance = (index: number) => (boxes[index].x - x) ** 2 + (boxes[index].y - y) ** 2;
    // Prefer the nearest top-left corner; drawing order only breaks ties.
    return hits.sort((a, b) => distance(a) - distance(b) || b - a);
}

export function nextBoxHit(hits: number[], selected: number): number | undefined {
    return hits.length ? hits[(hits.indexOf(selected) + 1) % hits.length] : undefined;
}

export function dragBox(
    box: BoundingBox,
    handle: BoxHandle,
    dx: number,
    dy: number,
    width: number,
    height: number,
    modifiers: { keepRatio?: boolean; fromCenter?: boolean } = {},
): BoundingBox {
    if (handle === 'move')
        return {
            ...box,
            x: clamp(Math.round(box.x + dx), 0, Math.max(0, width - box.width)),
            y: clamp(Math.round(box.y + dy), 0, Math.max(0, height - box.height)),
        };
    if ((modifiers.keepRatio || modifiers.fromCenter) && box.width > 0 && box.height > 0) {
        const sx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0;
        const sy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const factor = modifiers.fromCenter ? 2 : 1;
        const anchorX = modifiers.fromCenter || !sx ? cx : sx < 0 ? box.x + box.width : box.x;
        const anchorY = modifiers.fromCenter || !sy ? cy : sy < 0 ? box.y + box.height : box.y;
        const centeredX = modifiers.fromCenter || !sx;
        const centeredY = modifiers.fromCenter || !sy;
        const maxWidth = Math.max(1, centeredX ? 2 * Math.min(cx, width - cx) : sx < 0 ? anchorX : width - anchorX);
        const maxHeight = Math.max(1, centeredY ? 2 * Math.min(cy, height - cy) : sy < 0 ? anchorY : height - anchorY);
        let nextWidth = box.width + sx * dx * factor;
        let nextHeight = box.height + sy * dy * factor;
        if (modifiers.keepRatio) {
            const scaleX = nextWidth / box.width;
            const scaleY = nextHeight / box.height;
            const desired = !sx ? scaleY : !sy ? scaleX : Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
            const maxScale = Math.min(maxWidth / box.width, maxHeight / box.height);
            const minScale = Math.min(maxScale, Math.max(1 / box.width, 1 / box.height));
            const scale = clamp(desired, minScale, maxScale);
            nextWidth = box.width * scale;
            nextHeight = box.height * scale;
        } else {
            nextWidth = sx ? clamp(nextWidth, 1, maxWidth) : box.width;
            nextHeight = sy ? clamp(nextHeight, 1, maxHeight) : box.height;
        }
        return {
            ...box,
            x: centeredX ? anchorX - nextWidth / 2 : sx < 0 ? anchorX - nextWidth : anchorX,
            y: centeredY ? anchorY - nextHeight / 2 : sy < 0 ? anchorY - nextHeight : anchorY,
            width: nextWidth,
            height: nextHeight,
        };
    }
    let left = box.x,
        right = box.x + box.width,
        top = box.y,
        bottom = box.y + box.height;
    if (handle.includes('w')) left = clamp(Math.round(left + dx), 0, right - 1);
    if (handle.includes('e')) right = clamp(Math.round(right + dx), left + 1, width);
    if (handle.includes('n')) top = clamp(Math.round(top + dy), 0, bottom - 1);
    if (handle.includes('s')) bottom = clamp(Math.round(bottom + dy), top + 1, height);
    return { ...box, x: left, y: top, width: right - left, height: bottom - top };
}

export function scaleBoxes(boxes: BoundingBox[], fromWidth: number, fromHeight: number, toWidth: number, toHeight: number): BoundingBox[] {
    return cloneBoxes(boxes).map((box) => ({
        ...box,
        x: Math.round((box.x * toWidth) / fromWidth),
        y: Math.round((box.y * toHeight) / fromHeight),
        width: Math.round((box.width * toWidth) / fromWidth),
        height: Math.round((box.height * toHeight) / fromHeight),
    }));
}

export function moveBoxes(boxes: BoundingBox[], indices: number[], dx: number, dy: number, width: number, height: number): BoundingBox[] {
    const selected = new Set(indices);
    const group = boxes.filter((_, index) => selected.has(index));
    if (!group.length) return boxes;
    const left = Math.min(...group.map((box) => box.x));
    const top = Math.min(...group.map((box) => box.y));
    const right = Math.max(...group.map((box) => box.x + box.width));
    const bottom = Math.max(...group.map((box) => box.y + box.height));
    // Clamp the shared delta, rather than each rectangle, to preserve their spacing.
    const x = right - left > width ? 0 : clamp(dx, -left, width - right);
    const y = bottom - top > height ? 0 : clamp(dy, -top, height - bottom);
    return boxes.map((box, index) => (selected.has(index) ? { ...box, x: box.x + x, y: box.y + y } : box));
}

export function selectedBoxBounds(boxes: BoundingBox[], indices: number[]): BoundingBox | null {
    const selected = boxes.filter((_, index) => indices.includes(index));
    if (!selected.length) return null;
    const x = Math.min(...selected.map((box) => box.x));
    const y = Math.min(...selected.map((box) => box.y));
    return {
        ...emptyBox(x, y),
        width: Math.max(...selected.map((box) => box.x + box.width)) - x,
        height: Math.max(...selected.map((box) => box.y + box.height)) - y,
    };
}

export function resizeBoxGroup(
    boxes: BoundingBox[],
    indices: number[],
    handle: BoxHandle,
    dx: number,
    dy: number,
    width: number,
    height: number,
    modifiers: { keepRatio?: boolean; fromCenter?: boolean } = {},
): BoundingBox[] {
    const bounds = selectedBoxBounds(boxes, indices);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return boxes;
    const next = dragBox(bounds, handle, dx, dy, width, height, modifiers);
    const sx = next.width / bounds.width,
        sy = next.height / bounds.height;
    return boxes.map((box, index) =>
        indices.includes(index)
            ? {
                  ...box,
                  x: next.x + (box.x - bounds.x) * sx,
                  y: next.y + (box.y - bounds.y) * sy,
                  width: box.width * sx,
                  height: box.height * sy,
              }
            : box,
    );
}
