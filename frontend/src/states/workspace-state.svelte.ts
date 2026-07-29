import type { GridStack, GridStackWidget } from 'gridstack';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { BoardId } from '@/types/board';
import type { FloatingPosition, LayoutType } from '@/types/layout';
import { appState } from './app-state.svelte';
import type { ComfyGridGroup, ComfyGridNode } from './model-state.svelte';

export class Layout {
    #graphId = $state<string | null>(null);
    readonly #floatingNodes = new SvelteMap<string, BoardId>();
    readonly #floatingWidgets = new SvelteMap<string, BoardId>();
    readonly #floatingPositions = new SvelteMap<string, Record<string, FloatingPosition>>();
    readonly #promptWidgetIds = new SvelteSet<string>();
    readonly #translateWidgetIds = new SvelteSet<string>();
    readonly #translateModels = new SvelteMap<string, string>();
    readonly #translateSystems = new SvelteMap<string, string>();
    #positivePromptWidgetId = $state<string | null>(null);
    #negativePromptWidgetId = $state<string | null>(null);
    #noControlNodes = $state<boolean>(false);
    #noCollapsedNodes = $state<boolean>(false);
    #sortOrder = $state<'default' | 'name'>('default');

    get graphId() {
        return this.#graphId;
    }
    get floatingNodes(): ReadonlyMap<string, BoardId> {
        return this.#floatingNodes;
    }
    get floatingWidgets(): ReadonlyMap<string, BoardId> {
        return this.#floatingWidgets;
    }
    get floatingPositions(): ReadonlyMap<string, Record<string, FloatingPosition>> {
        return this.#floatingPositions;
    }
    isPromptWidget(widgetId: string): boolean {
        return this.#promptWidgetIds.has(widgetId);
    }
    get promptWidgetIds(): ReadonlySet<string> {
        return this.#promptWidgetIds;
    }
    isTranslateWidget(widgetId: string): boolean {
        return this.#translateWidgetIds.has(widgetId);
    }
    get translateWidgetIds(): ReadonlySet<string> {
        return this.#translateWidgetIds;
    }
    getTranslateModel(widgetId: string): string | undefined {
        return this.#translateModels.get(widgetId);
    }
    setTranslateModel(widgetId: string, model: string) {
        if (model) {
            this.#translateModels.set(widgetId, model);
        } else {
            this.#translateModels.delete(widgetId);
        }
    }
    getTranslateSystem(widgetId: string): string | undefined {
        return this.#translateSystems.get(widgetId);
    }
    setTranslateSystem(widgetId: string, system: string) {
        if (system) {
            this.#translateSystems.set(widgetId, system);
        } else {
            this.#translateSystems.delete(widgetId);
        }
    }
    get positivePromptWidgetId(): string | null {
        return this.#positivePromptWidgetId;
    }
    get negativePromptWidgetId(): string | null {
        return this.#negativePromptWidgetId;
    }
    get noControlNodes() {
        return this.#noControlNodes;
    }
    get noCollapsedNodes() {
        return this.#noCollapsedNodes;
    }
    get sortOrder() {
        return this.#sortOrder;
    }

    set graphId(graphId: string) {
        this.#graphId = graphId;
    }
    setFloatingNodes(nodeId: string, boardId: BoardId) {
        this.#floatingNodes.set(nodeId, boardId);
    }
    deleteFloatingNode(nodeId: string) {
        this.#floatingNodes.delete(nodeId);
    }
    setFloatingWidgets(widgetId: string, boardId: BoardId) {
        this.#floatingWidgets.set(widgetId, boardId);
    }
    deleteFloatingWidget(widgetId: string) {
        this.#floatingWidgets.delete(widgetId);
    }
    addPromptWidgetId(widgetId: string) {
        this.#promptWidgetIds.add(widgetId);
    }
    deletePromptWidgetId(widgetId: string) {
        this.#promptWidgetIds.delete(widgetId);
    }
    addTranslateWidgetId(widgetId: string) {
        this.#translateWidgetIds.add(widgetId);
    }
    deleteTranslateWidgetId(widgetId: string) {
        this.#translateWidgetIds.delete(widgetId);
    }
    setPositivePromptWidgetId(positivePromptWidgetId: string | null) {
        this.#positivePromptWidgetId = positivePromptWidgetId;
    }
    setNegativePromptWidgetId(negativePromptWidgetId: string | null) {
        this.#negativePromptWidgetId = negativePromptWidgetId;
    }
    set noControlNodes(noControlNodes: boolean) {
        this.#noControlNodes = noControlNodes;
    }
    set noCollapsedNodes(noCollapsedNodes: boolean) {
        this.#noCollapsedNodes = noCollapsedNodes;
    }
    set sortOrder(sortOrder: 'default' | 'name') {
        this.#sortOrder = sortOrder;
    }

    export(): LayoutType {
        const nodes = appState.workspaceState.nodes;
        const hasNodes = nodes.size > 0;
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const validNodeIds = new Set<string>();
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const validWidgetIds = new Set<string>();

        if (hasNodes) {
            for (const node of nodes.values()) {
                validNodeIds.add(String(node.id));
                for (const widget of node.widgets) {
                    validWidgetIds.add(String(widget.id));
                }
            }

            for (const key of Array.from(this.#translateModels.keys())) {
                if (!validWidgetIds.has(key)) this.#translateModels.delete(key);
            }
            for (const key of Array.from(this.#translateSystems.keys())) {
                if (!validWidgetIds.has(key)) this.#translateSystems.delete(key);
            }
            for (const id of Array.from(this.#translateWidgetIds)) {
                if (!validWidgetIds.has(id)) this.#translateWidgetIds.delete(id);
            }
            for (const id of Array.from(this.#promptWidgetIds)) {
                if (!validWidgetIds.has(id)) this.#promptWidgetIds.delete(id);
            }
            for (const key of Array.from(this.#floatingNodes.keys())) {
                if (!validNodeIds.has(key)) this.#floatingNodes.delete(key);
            }
            for (const key of Array.from(this.#floatingWidgets.keys())) {
                if (!validWidgetIds.has(key)) this.#floatingWidgets.delete(key);
            }
            if (this.#positivePromptWidgetId && !validWidgetIds.has(this.#positivePromptWidgetId)) {
                this.#positivePromptWidgetId = null;
            }
            if (this.#negativePromptWidgetId && !validWidgetIds.has(this.#negativePromptWidgetId)) {
                this.#negativePromptWidgetId = null;
            }
        }

        const allBoardLayouts: Record<string, Record<string, FloatingPosition>> = {};
        for (const [boardId, grid] of appState.workspaceState.gridStackBoards) {
            const layout = (grid.save(true) ?? []) as GridStackWidget[];
            const idKeyLayout = layout.reduce(
                (acc, item) => {
                    if (!hasNodes || validNodeIds.has(item.id) || validWidgetIds.has(item.id)) {
                        acc[item.id] = {
                            x: item.x,
                            y: item.y,
                            w: item.w ?? 1,
                            h: item.h ?? 1,
                        };
                    }
                    return acc;
                },
                {} as Record<string, FloatingPosition>,
            );
            const key = boardId.split('-')[0];
            allBoardLayouts[key] = { ...allBoardLayouts[key], ...idKeyLayout };
        }

        const rawValues: Record<string, string> = {};
        for (const node of appState.workspaceState.nodes.values()) {
            for (const widget of node.widgets) {
                if (widget.rawValue) {
                    rawValues[widget.id] = widget.rawValue;
                }
            }
        }

        return {
            graphId: this.#graphId,
            floatingPositions: allBoardLayouts,
            floatingNodes: Object.fromEntries(Array.from(this.#floatingNodes.entries()).filter(([, boardId]) => Boolean(boardId))),
            floatingWidgets: Object.fromEntries(Array.from(this.#floatingWidgets.entries()).filter(([, boardId]) => Boolean(boardId))),
            promptWidgetIds: [...this.#promptWidgetIds],
            positivePromptWidgetId: this.#positivePromptWidgetId,
            negativePromptWidgetId: this.#negativePromptWidgetId,
            translateWidgetIds: [...this.#translateWidgetIds],
            rawValues,
            translateModels: Object.fromEntries(Array.from(this.#translateModels.entries()).filter(([, v]) => Boolean(v))),
            translateSystems: Object.fromEntries(Array.from(this.#translateSystems.entries()).filter(([, v]) => Boolean(v))),
            noControlNodes: this.#noControlNodes,
            noCollapsedNodes: this.#noCollapsedNodes,
            sortOrder: this.#sortOrder,
        };
    }

    import(layout: LayoutType) {
        this.#graphId = layout.graphId;
        this.#floatingNodes.clear();
        Object.entries(layout.floatingNodes).forEach(([key, value]) => {
            this.#floatingNodes.set(key, value);
        });
        this.#floatingWidgets.clear();
        Object.entries(layout.floatingWidgets).forEach(([key, value]) => {
            this.#floatingWidgets.set(key, value);
        });
        this.#floatingPositions.clear();
        Object.entries(layout.floatingPositions).forEach(([key, value]) => {
            this.#floatingPositions.set(key, value);
        });
        this.#promptWidgetIds.clear();
        layout.promptWidgetIds.forEach((widgetId) => {
            this.#promptWidgetIds.add(widgetId);
        });
        this.#positivePromptWidgetId = layout.positivePromptWidgetId;
        this.#negativePromptWidgetId = layout.negativePromptWidgetId;
        this.#translateWidgetIds.clear();
        (layout.translateWidgetIds ?? []).forEach((widgetId) => {
            this.#translateWidgetIds.add(widgetId);
        });
        Object.entries(layout.rawValues ?? {}).forEach(([key, value]) => {
            for (const node of appState.workspaceState.nodes.values()) {
                const widget = node.widgets.find((w) => w.id === key);
                if (widget) {
                    widget.rawValue = value;
                    break;
                }
            }
        });
        this.#translateModels.clear();
        Object.entries(layout.translateModels ?? {}).forEach(([key, value]) => {
            this.#translateModels.set(key, value);
        });
        this.#translateSystems.clear();
        Object.entries(layout.translateSystems ?? {}).forEach(([key, value]) => {
            this.#translateSystems.set(key, value);
        });
        this.#noControlNodes = layout.noControlNodes ?? true;
        this.#noCollapsedNodes = layout.noCollapsedNodes ?? true;
        this.#sortOrder = layout.sortOrder ?? 'default';
    }
}

class WorkspaceState {
    readonly #gridStackBoards = new SvelteMap<string, GridStack>();
    #groups: ComfyGridGroup[] = $state([]);
    readonly #nodes = new SvelteMap<string, ComfyGridNode>();
    readonly #layout = $state<Layout>(new Layout());
    readonly #errorWidgets = new SvelteMap<string, Set<string>>();

    nodeModes = $derived(Object.fromEntries(Array.from(this.#nodes.entries()).map(([id, node]) => [id, node.mode])));

    get gridStackBoards(): ReadonlyMap<string, GridStack> {
        return this.#gridStackBoards;
    }
    get groups(): ReadonlyArray<ComfyGridGroup> {
        return this.#groups;
    }
    get nodes(): ReadonlyMap<string, ComfyGridNode> {
        return this.#nodes;
    }
    getRealNode(nodeId: string) {
        if (nodeId.includes(':')) {
            nodeId = nodeId.split(':').at(-1);
        }
        return this.#nodes.get(nodeId);
    }
    getTopNode(nodeId: string) {
        if (nodeId.includes(':')) {
            nodeId = nodeId.split(':').at(0);
        }
        return this.#nodes.get(nodeId);
    }
    #getNodes(nodeId: string) {
        const nodeIds = nodeId.split(':');
        return nodeIds.map((n) => this.getRealNode(n)).filter(Boolean);
    }
    getAllNodes(nodeIds: string[]) {
        const entries = nodeIds.flatMap((n) => this.#getNodes(n)).map((n) => [n.id, n] as const);

        return [...new Map(entries).values()];
    }
    get layout(): Readonly<Layout> {
        return this.#layout;
    }
    get errorWidgets(): ReadonlyMap<string, ReadonlySet<string>> {
        return this.#errorWidgets;
    }

    setGridStackBoard(key: string, gridStack: GridStack) {
        this.#gridStackBoards.set(key, gridStack);
    }
    deleteGridStackBoard(key: string) {
        this.#gridStackBoards.delete(key);
    }

    setGroups(groups: ComfyGridGroup[]) {
        this.#groups = groups;
    }

    setNodes(nodes: ComfyGridNode[]) {
        this.#nodes.clear();
        for (const node of nodes) {
            this.#nodes.set(node.id, node);
        }
    }

    addErrorWidget(nodeId: string, widgetId: string) {
        if (!this.#errorWidgets.has(nodeId)) {
            this.#errorWidgets.set(nodeId, new SvelteSet<string>());
        }
        this.#errorWidgets.get(nodeId).add(widgetId);
    }

    deleteErrorWidget(nodeId: string, widgetId: string) {
        if (!this.#errorWidgets.has(nodeId)) {
            return;
        }
        const errorWidgets = this.#errorWidgets.get(nodeId);
        errorWidgets.delete(widgetId);
        if (errorWidgets.size === 0) {
            this.#errorWidgets.delete(nodeId);
        }
    }

    clearErrorWidgets() {
        this.#errorWidgets.clear();
    }

    hasErrorNode(nodeId: string) {
        return this.#errorWidgets.has(nodeId);
    }
}

export const workspaceState = new WorkspaceState();
