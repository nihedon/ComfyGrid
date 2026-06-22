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
        const allBoardLayouts: Record<string, Record<string, FloatingPosition>> = {};
        for (const [boardId, grid] of appState.workspaceState.gridStackBoards) {
            const layout = (grid.save(true) ?? []) as GridStackWidget[];
            const idKeyLayout = layout.reduce(
                (acc, item) => {
                    acc[item.id] = {
                        x: item.x,
                        y: item.y,
                        w: item.w ?? 1,
                        h: item.h ?? 1,
                    };
                    return acc;
                },
                {} as Record<string, FloatingPosition>,
            );
            const key = boardId.split('-')[0];
            allBoardLayouts[key] = { ...allBoardLayouts[key], ...idKeyLayout };
        }
        return {
            graphId: this.#graphId,
            floatingPositions: allBoardLayouts,
            floatingNodes: Object.fromEntries(Array.from(this.#floatingNodes.entries()).filter(([, boardId]) => Boolean(boardId))),
            floatingWidgets: Object.fromEntries(Array.from(this.#floatingWidgets.entries()).filter(([, boardId]) => Boolean(boardId))),
            promptWidgetIds: [...this.#promptWidgetIds],
            positivePromptWidgetId: this.#positivePromptWidgetId,
            negativePromptWidgetId: this.#negativePromptWidgetId,
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
