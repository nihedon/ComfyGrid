import { tick } from 'svelte';
import { GridStack, type GridStackWidget } from 'gridstack';
import { get } from 'svelte/store';
import { t } from '@/i18n/i18n';
import { callLayoutChangedCallbacks } from '@/services/callback-service';
import { appState } from '@/states/app-state.svelte';
import { Layout } from '@/states/workspace-state.svelte';
import type { FloatingPosition, LayoutType } from '@/types/layout';
import logger from '@/utils/logger';
import { waitForDom } from '@/utils/schedule';

// Svelte action: set GridStack attrs without TS complaining about unknown props
export function gs(node: HTMLElement, { id = '', x, y, w, h }: { id?: string; x?: number; y?: number; w?: number; h?: number } = {}) {
    const apply = (p: { id?: string; x?: number; y?: number; w?: number; h?: number }) => {
        if (p.id !== undefined) node.setAttribute('gs-id', p.id);
        if (p.x !== undefined) node.setAttribute('gs-x', String(p.x));
        if (p.y !== undefined) node.setAttribute('gs-y', String(p.y));
        if (p.w !== undefined) node.setAttribute('gs-w', String(p.w));
        if (p.h !== undefined) node.setAttribute('gs-h', String(p.h));
    };
    const params = { id, x, y, w, h };
    apply(params);
    return {
        update(newParams: { id?: string; x?: number; y?: number; w?: number; h?: number }) {
            apply(newParams);
        },
    };
}

export function saveLayoutObject(layout: Readonly<Layout>) {
    saveLayout(layout.export());
}

function saveLayout(layout: LayoutType) {
    localStorage.setItem(`comfygrid-layout-${layout.graphId}`, JSON.stringify(layout));
    logger.log('Current floatingPositions saved:', layout);
}

function makeEptyLayout(graph_id: string): LayoutType {
    return {
        graphId: graph_id,
        floatingPositions: {},
        floatingNodes: {},
        floatingWidgets: {},
        promptWidgetIds: [],
        positivePromptWidgetId: null,
        negativePromptWidgetId: null,
        noControlNodes: true,
        noCollapsedNodes: true,
        sortOrder: 'default',
    };
}

export function loadLayout(graphId: string): LayoutType {
    if (graphId === '') {
        return makeEptyLayout(graphId);
    }

    const strLayout = localStorage.getItem(`comfygrid-layout-${graphId}`);
    if (strLayout) {
        try {
            return JSON.parse(strLayout) as LayoutType;
        } catch (err) {
            logger.error('Failed to load gridStackWidget:', err);
            localStorage.removeItem(`comfygrid-layout-${graphId}`);
        }
    }
    return {
        graphId,
        floatingPositions: {},
        floatingNodes: {},
        floatingWidgets: {},
        promptWidgetIds: [],
        positivePromptWidgetId: null,
        negativePromptWidgetId: null,
        noControlNodes: true,
        noCollapsedNodes: true,
        sortOrder: 'default',
    };
}

export function openLayout() {
    const inputElem = document.createElement('input');
    inputElem.setAttribute('type', 'file');
    inputElem.setAttribute('accept', 'application/json');
    inputElem.addEventListener('change', (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const fileData = e.target?.result as string;
                const json = JSON.parse(fileData);
                if (json.comfygrid) {
                    await importLayout(JSON.stringify(json.comfygrid));
                } else {
                    appState.toastState.addToast({ type: 'warning', message: get(t)('toast.no_layout_found') });
                }
            } catch (err) {
                logger.error('Failed to import gridStackWidget:', err);
            }
        };
        reader.readAsText(file, 'utf-8');
    });
    inputElem.click();
    inputElem.remove();
}

export async function importLayout(strLayout: string) {
    try {
        const layout = JSON.parse(strLayout) as LayoutType;
        saveLayout(layout);

        appState.workspaceState.layout.import(layout);
        await tick();
        applyFloatingPositions(undefined, layout.floatingPositions);
        await tick();
        callLayoutChangedCallbacks();
        logger.log('FloatingPositions imported:', layout);
    } catch (err) {
        logger.error('Failed to import gridStackWidget:', err);
    }
}

export function updateAttribute(grid: GridStack) {
    if (!grid.el) return;
    const children = Array.from(grid.el.children) as HTMLElement[];
    const savedLayout = (grid.save(false) as GridStackWidget[]).reduce(
        (acc, item) => {
            if (item.id) {
                acc[item.id] = { x: item.x, y: item.y, w: item.w, h: item.h };
            }
            return acc;
        },
        {} as Record<string, FloatingPosition>,
    );

    children.forEach((child) => {
        const id = child.getAttribute('gs-id');
        const layout = id ? savedLayout[id] : null;
        if (layout) {
            Object.entries(layout).forEach(([key, val]) => {
                const current = child.getAttribute(`gs-${key}`);
                const next = String(val);
                if (current !== next) {
                    child.setAttribute(`gs-${key}`, next);
                }
            });
        }
    });
}

export function applyFloatingPositions(boardId?: string, initSettings?: Record<string, Record<string, FloatingPosition>>) {
    const boardIds = boardId ? [boardId] : appState.workspaceState.gridStackBoards.keys();

    for (const exactGridKey of boardIds) {
        const grid = appState.workspaceState.gridStackBoards.get(exactGridKey);
        if (!grid) continue;

        const logicalKey = exactGridKey.split('-')[0];
        const container = grid.el;
        if (!container) continue;

        const children = Array.from(container.children) as HTMLElement[];
        const boardSettings = initSettings?.[logicalKey] ?? appState.workspaceState.layout?.floatingPositions?.[logicalKey];

        // 1. Sync attributes from settings for DOM nodes (if settings available)
        if (boardSettings) {
            children.forEach((el) => {
                const id = el.getAttribute('gs-id');
                if (id && boardSettings[id]) {
                    const s = boardSettings[id];
                    if (s.x !== undefined) el.setAttribute('gs-x', String(s.x));
                    if (s.y !== undefined) el.setAttribute('gs-y', String(s.y));
                    if (s.w !== undefined) el.setAttribute('gs-w', String(s.w));
                    if (s.h !== undefined) el.setAttribute('gs-h', String(s.h));
                }
            });
        }

        // 2. Identify current maxY to avoid overlapping new items with existing layouts
        let maxY = 0;
        grid.getGridItems().forEach((w) => {
            maxY = Math.max(maxY, (w.gridstackNode?.y ?? 0) + (w.gridstackNode?.h ?? 0));
        });

        // 3. For new items (no gs-y coordinate), assign the maxY to ensure they append to bottom
        children.forEach((el) => {
            if (el.getAttribute('gs-y') === null) {
                el.setAttribute('gs-y', String(maxY));
                if (el.getAttribute('gs-x') === null) {
                    el.setAttribute('gs-x', '0');
                }
            }
        });

        // 4. Stable rebuild from sorted DOM
        children.sort((a, b) => {
            const ay = Number(a.getAttribute('gs-y') || '9999');
            const ax = Number(a.getAttribute('gs-x') || '0');
            const by = Number(b.getAttribute('gs-y') || '9999');
            const bx = Number(b.getAttribute('gs-x') || '0');
            if (ay !== by) return ay - by;
            return ax - bx;
        });

        grid.batchUpdate();
        grid.removeAll(false);
        children.forEach((child) => {
            grid.makeWidget(child);
        });
        grid.commit();

        // 5. Final sync internal -> DOM attributes to ensure Svelte sees the actual final positions
        updateAttribute(grid);
    }
}

export function syncAndSaveLayout() {
    if (!appState.workspaceState.layout) return;
    saveLayoutObject(appState.workspaceState.layout);
    callLayoutChangedCallbacks();
}

export async function updateBoardFloatingState() {
    await waitForDom();
    applyFloatingPositions();
    await waitForDom(); // Allow GridStack to process newly created elements
    syncAndSaveLayout();
}
