function roundHalfToEven(value: number): number {
    const floor = Math.floor(value);
    return value - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(value);
}

export function calculateResolutionPreview(ratio: unknown, megapixels: unknown, multiple: unknown) {
    const match = typeof ratio === 'string' ? /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/.exec(ratio) : null;
    if (
        !match ||
        typeof megapixels !== 'number' ||
        !Number.isFinite(megapixels) ||
        megapixels <= 0 ||
        typeof multiple !== 'number' ||
        !Number.isFinite(multiple) ||
        multiple <= 0
    )
        return null;

    const wRatio = Number(match[1]);
    const hRatio = Number(match[2]);
    if (!Number.isFinite(wRatio) || !Number.isFinite(hRatio) || wRatio <= 0 || hRatio <= 0) return null;

    // Match ComfyUI's ResolutionSelector, including Python round() ties to even.
    const scale = Math.sqrt((megapixels * 1024 * 1024) / (wRatio * hRatio));
    const width = roundHalfToEven((wRatio * scale) / multiple) * multiple;
    const height = roundHalfToEven((hRatio * scale) / multiple) * multiple;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { width, height, megapixels: (width * height) / (1024 * 1024) };
}
