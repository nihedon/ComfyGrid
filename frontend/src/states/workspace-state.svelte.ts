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
    #showControlLessNodes = $state<boolean>(false);
    #showCollapsedNodes = $state<boolean>(false);
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
    get showControlLessNodes() {
        return this.#showControlLessNodes;
    }
    get showCollapsedNodes() {
        return this.#showCollapsedNodes;
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
    set showControlLessNodes(val: boolean) {
        this.#showControlLessNodes = val;
    }
    set showCollapsedNodes(val: boolean) {
        this.#showCollapsedNodes = val;
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

        return {
            graphId: this.#graphId,
            floatingPositions: allBoardLayouts,
            floatingNodes: Object.fromEntries(Array.from(this.#floatingNodes.entries()).filter(([, boardId]) => Boolean(boardId))),
            floatingWidgets: Object.fromEntries(Array.from(this.#floatingWidgets.entries()).filter(([, boardId]) => Boolean(boardId))),
            promptWidgetIds: [...this.#promptWidgetIds],
            positivePromptWidgetId: this.#positivePromptWidgetId,
            negativePromptWidgetId: this.#negativePromptWidgetId,
            translateWidgetIds: [...this.#translateWidgetIds],
            translateModels: Object.fromEntries(Array.from(this.#translateModels.entries()).filter(([, v]) => Boolean(v))),
            translateSystems: Object.fromEntries(Array.from(this.#translateSystems.entries()).filter(([, v]) => Boolean(v))),
            showControlLessNodes: this.#showControlLessNodes,
            showCollapsedNodes: this.#showCollapsedNodes,
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
        this.#translateModels.clear();
        Object.entries(layout.translateModels ?? {}).forEach(([key, value]) => {
            this.#translateModels.set(key, value);
        });
        this.#translateSystems.clear();
        Object.entries(layout.translateSystems ?? {}).forEach(([key, value]) => {
            this.#translateSystems.set(key, value);
        });
        if (layout.showControlLessNodes !== undefined) {
            this.#showControlLessNodes = layout.showControlLessNodes;
        } else {
            this.#showControlLessNodes = false;
        }

        if (layout.showCollapsedNodes !== undefined) {
            this.#showCollapsedNodes = layout.showCollapsedNodes;
        } else {
            this.#showCollapsedNodes = false;
        }
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

    getLogicalNodes(groupId?: string): ComfyGridNode[] {
        if (!groupId || groupId === '__ungrouped__') {
            return this.#groups.filter((g) => !g.isTabify).flatMap((g) => g.nodes);
        }
        const group = this.#groups.find((g) => g.id === groupId);
        return group ? [...group.nodes] : [];
    }

    getEffectiveNodes(boardTarget: BoardId | 'default' = '', groupId?: string): ComfyGridNode[] {
        const commonTabBoard = (appState.optionState.get('ComfyGrid.ui.common_tab_board') as boolean) ?? false;

        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const nodeGroupMap = new Map<string, ComfyGridGroup>();
        const traverseGroup = (g: ComfyGridGroup) => {
            for (const n of g.nodes) {
                nodeGroupMap.set(n.id, g);
            }
            for (const child of g.children) {
                traverseGroup(child);
            }
        };
        for (const g of this.#groups) {
            traverseGroup(g);
        }

        const showControlLessNodes = this.#layout.showControlLessNodes;
        const showCollapsedNodes = this.#layout.showCollapsedNodes;

        return Array.from(this.#nodes.values()).filter((node) => {
            const hasError = this.hasErrorNode(node.id);
            if (!hasError) {
                if (!showControlLessNodes && node.widgets.length === 0) return false;
                if (!showCollapsedNodes && node.collapsed) return false;
            }

            const floatingBoard = this.#layout.floatingNodes.get(node.id);
            const parentGroup = nodeGroupMap.get(node.id);

            if (floatingBoard) {
                if (boardTarget === 'Global') return floatingBoard === 'Global';
                if (boardTarget === 'Tab') {
                    if (commonTabBoard) return floatingBoard === 'Tab';
                    return floatingBoard === 'Tab' && (groupId === undefined || parentGroup?.id === groupId);
                }
                return false;
            }

            if (boardTarget === '' || boardTarget === 'default') {
                return !parentGroup || !parentGroup.isTabify;
            }

            return false;
        });
    }

    hasEffectiveNodes(boardTarget: BoardId | 'default' = '', groupId?: string): boolean {
        if (this.getEffectiveNodes(boardTarget, groupId).length > 0) {
            return true;
        }
        if (boardTarget !== 'Tab') {
            return false;
        }
        const commonTabBoard = (appState.optionState.get('ComfyGrid.ui.common_tab_board') as boolean) ?? false;
        for (const [widgetId, targetBoard] of this.#layout.floatingWidgets) {
            if (targetBoard !== 'Tab') {
                continue;
            }
            if (commonTabBoard) {
                return true;
            }
            if (groupId) {
                for (const node of this.#nodes.values()) {
                    if (node.widgets.some((w) => w.id === widgetId)) {
                        const parentGroup = this.#groups.find((g) => g.nodes.some((n) => n.id === node.id));
                        if (parentGroup?.id === groupId) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    hasTabContent(tabId: string): boolean {
        const commonTabBoard = (appState.optionState.get('ComfyGrid.ui.common_tab_board') as boolean) ?? false;

        if (tabId === '__ungrouped__') {
            const hasDefaultNodes = this.getEffectiveNodes('default').length > 0;
            const hasCommonTabBoardNodes = commonTabBoard && this.hasEffectiveNodes('Tab');
            return hasDefaultNodes || hasCommonTabBoardNodes;
        }

        const group = this.#groups.find((g) => g.id === tabId);
        if (!group) return false;

        const hasGroupVisibleNodes = group.hasVisibleNodes;
        const hasFloatingOnThisTab = !commonTabBoard && (this.getEffectiveNodes('Tab', tabId).length > 0 || this.hasEffectiveNodes('Tab', tabId));

        return hasGroupVisibleNodes || hasFloatingOnThisTab;
    }

    hasTabError(tabId: string): boolean {
        const commonTabBoard = (appState.optionState.get('ComfyGrid.ui.common_tab_board') as boolean) ?? false;

        if (tabId === '__ungrouped__') {
            const effectiveNodes = this.getEffectiveNodes('default');
            if (effectiveNodes.some((n) => this.hasErrorNode(n.id))) {
                return true;
            }

            if (commonTabBoard) {
                const tabBoardNodes = this.getEffectiveNodes('Tab');
                if (tabBoardNodes.some((n) => this.hasErrorNode(n.id))) {
                    return true;
                }
                for (const [widgetId, board] of this.#layout.floatingWidgets) {
                    if (board === 'Tab') {
                        for (const node of this.#nodes.values()) {
                            if (node.widgets.some((w) => w.id === widgetId) && this.hasErrorNode(node.id)) {
                                return true;
                            }
                        }
                    }
                }
            }
            return false;
        }

        const commonTabNodes = !commonTabBoard ? this.getEffectiveNodes('Tab', tabId) : [];
        if (commonTabNodes.some((n) => this.hasErrorNode(n.id))) {
            return true;
        }

        const group = this.#groups.find((g) => g.id === tabId);
        if (!group) return false;

        const nonFloatingNodes = group.nodes.filter((n) => !this.#layout.floatingNodes.get(n.id));
        return nonFloatingNodes.some((n) => this.hasErrorNode(n.id));
    }

    getTabNodes(tabId: string): ComfyGridNode[] {
        const commonTabBoard = (appState.optionState.get('ComfyGrid.ui.common_tab_board') as boolean) ?? false;

        if (tabId === '__ungrouped__') {
            const nodes = [...this.getEffectiveNodes('default')];
            if (commonTabBoard) {
                nodes.push(...this.getEffectiveNodes('Tab'));
            }
            return nodes;
        }

        const nodes = !commonTabBoard ? this.getEffectiveNodes('Tab', tabId) : [];
        const group = this.#groups.find((g) => g.id === tabId);
        if (group) {
            const nonFloatingNodes = group.nodes.filter((n) => !this.#layout.floatingNodes.get(n.id));
            nodes.push(...nonFloatingNodes);
        }
        return nodes;
    }

    getTabModeSet(tabId: string): Set<number> {
        const tabNodes = this.getTabNodes(tabId);
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const modeSet = new Set<number>();
        for (const node of tabNodes) {
            modeSet.add(node.mode);
        }
        return modeSet;
    }

    isTabExecuting(tabId: string): boolean {
        const tabNodes = this.getTabNodes(tabId);
        return tabNodes.some((n) => appState.executionState.runningNodeId === n.id);
    }

    getDefaultTabModeSet(): Set<number> {
        const nonTabifiedGroups = this.#groups.filter((g) => !g.isTabify);
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const modeSet = new Set<number>();
        for (const g of nonTabifiedGroups) {
            for (const mode of g.modeSet) {
                modeSet.add(mode);
            }
        }
        return modeSet;
    }
}

export const workspaceState = new WorkspaceState();
