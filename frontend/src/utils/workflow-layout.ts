import type { LayoutType } from '@/types/layout';

function asRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch {
            return undefined;
        }
    }
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asLayout(value: unknown): LayoutType | undefined {
    const record = asRecord(value);
    if (!record) return undefined;
    const layout = asRecord(record.layout) ?? record;
    if (!asRecord(layout.floatingNodes) || !asRecord(layout.floatingWidgets) || !asRecord(layout.floatingPositions)) return undefined;
    return layout as LayoutType;
}

export function getWorkflowLayout(workflow: unknown, embeddedLayout?: unknown): LayoutType | undefined {
    const json = asRecord(workflow);
    const extra = asRecord(json?.extra);
    const comfygrid = asRecord(extra?.comfygrid);
    return asLayout(embeddedLayout) ?? asLayout(json?.comfygrid) ?? asLayout(comfygrid?.layout);
}
