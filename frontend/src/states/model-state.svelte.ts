import { workflowManager } from '@/managers/workflow-manager';
import type { ComfyGroup, ComfyNode, ComfyWidget } from '@/types/comfy-model';
import type { GroupProps, NodeProps, WidgetProps } from '@/types/model-props';
import type { ComfyNodeMode, ImageInfo, WidgetContext } from '@/types/model-shared';
import { appState } from './app-state.svelte';

/**
 * Compare two positionable items by coordinates
 * @param a - First item
 * @param b - Second item
 */
function comparePositions(a: { pos: { x: number; y: number } }, b: { pos: { x: number; y: number } }): number {
    const TOLERANCE = 40;
    const ax = Math.floor(a.pos.x / TOLERANCE) * TOLERANCE;
    const ay = a.pos.y;
    const bx = Math.floor(b.pos.x / TOLERANCE) * TOLERANCE;
    const by = b.pos.y;
    if (ax !== bx) return ax - bx;
    return ay - by;
}

export class ComfyGridGroup {
    readonly #comfyGroup: ComfyGroup;
    #id: string = $state();
    #title: string = $state();
    readonly #children: ComfyGridGroup[] = $state([]);
    readonly #nodes: ComfyGridNode[] = $state([]);
    #color: string | null = $state();
    readonly #pos: { x: number; y: number } = { x: 0, y: 0 };
    #expanded: boolean = $state();

    constructor(group: GroupProps & { nodes?: NodeProps[]; children?: GroupProps[]; expanded?: boolean }) {
        this.#comfyGroup = group.comfyGroup;
        this.#id = group.id;
        this.#title = group.title;
        this.clearChildren();
        for (const child of group.children ?? []) {
            this.addChild(new ComfyGridGroup(child));
        }
        this.clearNodes();
        for (const node of group.nodes ?? []) {
            this.addNode(new ComfyGridNode(node));
        }
        this.#color = group.color;
        this.#pos = group.pos;
        this.#expanded = group.expanded ?? false;
    }

    static sortGroupsByPriority(a: ComfyGridGroup, b: ComfyGridGroup) {
        const diffPriority = (a.id == null ? -1 : 0) - (b.id == null ? -1 : 0);
        if (diffPriority !== 0) return diffPriority;
        if (appState.workspaceState.layout.sortOrder === 'name') {
            const diff = a.titlePriority - b.titlePriority;
            if (diff !== 0) return diff;
            return a.title.localeCompare(b.title);
        } else {
            return ComfyGridGroup.#compareGroupsByPosition(a, b);
        }
    }

    static #compareGroupsByPosition(a: ComfyGridGroup, b: ComfyGridGroup): number {
        return comparePositions(a, b);
    }

    readonly isTabify = $derived.by(() => {
        const groupTabify = appState.optionState.opts.get('group_tabify') || 'all_top_groups';
        if (groupTabify === 'all_top_groups') {
            return this.#id;
        }
        if (groupTabify === 'tab_groups_only') {
            return this.#id && this.#title.startsWith('[Tab]');
        }
        return false;
    });

    readonly titlePriority = $derived.by(() => {
        if (this.#title.startsWith('#')) return -1;
        if (this.#title.startsWith('?')) return 1;
        return 0;
    });

    readonly noControlNodes = $derived(appState.workspaceState.layout.noControlNodes ?? true);
    readonly noCollapsedNodes = $derived(appState.workspaceState.layout.noCollapsedNodes ?? true);
    readonly hasVisibleNodes = $derived.by(() => {
        if (
            this.#nodes.some((node) => {
                if (this.noControlNodes && node.widgets.length === 0) return false;
                if (this.noCollapsedNodes && node.collapsed) return false;
                if (appState.workspaceState.layout.floatingNodes.get(node.id)) return false;
                return true;
            })
        ) {
            return true;
        }
        return this.#children.some((child) => child.hasVisibleNodes);
    });

    get comfyGroup(): ComfyGroup {
        return this.#comfyGroup;
    }
    get id() {
        return this.#id;
    }
    get title() {
        return this.#title;
    }
    get children(): ReadonlyArray<ComfyGridGroup> {
        return this.#children;
    }
    get sortedChildren(): ReadonlyArray<ComfyGridGroup> {
        return this.#children.toSorted(ComfyGridGroup.sortGroupsByPriority);
    }
    get nodes(): ReadonlyArray<ComfyGridNode> {
        return this.#nodes;
    }
    get color() {
        return this.#color;
    }
    get pos(): Readonly<{ x: number; y: number }> {
        return this.#pos;
    }
    get expanded() {
        return this.#expanded;
    }

    set id(id: string) {
        this.#id = id;
    }
    set title(title: string) {
        this.#title = title;
    }
    addChild(child: ComfyGridGroup) {
        this.#children.push(child);
    }
    clearChildren() {
        this.#children.length = 0;
    }
    addNode(node: ComfyGridNode) {
        this.#nodes.push(node);
    }
    clearNodes() {
        this.#nodes.length = 0;
    }
    set color(color: string | null) {
        this.#color = color;
    }
    set pos(pos: { x: number; y: number }) {
        this.#pos.x = pos.x;
        this.#pos.y = pos.y;
    }
    set expanded(expanded: boolean) {
        this.#expanded = expanded;
    }

    setComfyUiProperty(key: string, value: unknown) {
        setNestedProperty(this as unknown as Record<string, unknown>, key, value);
    }
}

export class ComfyGridNode<P = undefined> {
    readonly #comfyNode: ComfyNode;
    #id: string = $state();
    #parentNodeId: string = $state();
    #title: string = $state();
    #type: string = $state();
    readonly #pos: { x: number; y: number } = { x: 0, y: 0 };
    #collapsed: boolean = $state();
    #hasOutputNode: boolean = false;
    #mode: ComfyNodeMode = $state();
    #bgcolor: string | null = $state();
    readonly #inputs: { id: string; slot: string }[] = $state([]);
    readonly #outputs: { id: string; slot: string }[][] = $state([]);
    readonly #widgets: ComfyGridWidget[] = $state([]);
    readonly #groups: ComfyGridGroup[] = [];
    #properties: P = $state();
    #comfyClass: string;
    #constructorName: string;

    constructor(node: NodeProps) {
        this.#comfyNode = node.comfyNode;
        this.#id = node.id;
        this.#parentNodeId = node.parentNodeId;
        this.#title = node.title;
        this.#type = node.type;
        this.#collapsed = node.collapsed;
        this.#hasOutputNode = node.hasOutputNode;
        this.#mode = node.mode;
        this.#bgcolor = node.bgcolor;
        this.#inputs.length = 0;
        for (const input of node.inputs ?? []) {
            this.#inputs.push(input);
        }
        this.#outputs.length = 0;
        for (const output of node.outputs ?? []) {
            this.#outputs.push(output);
        }
        this.updateWidgetsFromProps(this, node.widgets);
        this.#groups.length = 0;
        for (const group of node.groups) {
            this.#groups.push(new ComfyGridGroup(group));
        }
        this.#properties = node.properties as P;
        this.#comfyClass = node.comfyClass;
        this.#constructorName = node.constructorName;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateWidgetsFromProps(node: ComfyGridNode<any>, widgets: WidgetProps[]) {
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const existingMap = new Map(this.#widgets.map((w) => [w.id, w]));
        const newWidgets: ComfyGridWidget[] = [];
        for (const w of widgets) {
            const existing = existingMap.get(w.id);
            if (existing) {
                existing.update(w);
                newWidgets.push(existing);
            } else {
                newWidgets.push(new ComfyGridWidget(node, w));
            }
        }
        this.#widgets.length = 0;
        this.#widgets.push(...newWidgets);
    }

    get comfyNode() {
        return this.#comfyNode;
    }
    get id() {
        return this.#id;
    }
    get parentNodeId(): string {
        return this.#parentNodeId;
    }
    get title() {
        return this.#title;
    }
    get type() {
        return this.#type;
    }
    get pos(): Readonly<{ x: number; y: number }> {
        return this.#pos;
    }
    get collapsed() {
        return this.#collapsed;
    }
    get hasOutputNode() {
        return this.#hasOutputNode;
    }
    get mode() {
        return this.#mode;
    }
    get bgcolor() {
        return this.#bgcolor;
    }
    get inputs(): ReadonlyArray<{ id: string; slot: string }> {
        return this.#inputs;
    }
    get outputs(): ReadonlyArray<ReadonlyArray<{ id: string; slot: string }>> {
        return this.#outputs;
    }
    get widgets() {
        return this.#widgets;
    }
    get groups() {
        return this.#groups;
    }
    get properties() {
        return this.#properties;
    }
    get comfyClass() {
        return this.#comfyClass;
    }
    get constructorName() {
        return this.#constructorName;
    }

    set id(id: string) {
        this.#id = id;
    }
    set parentNodeId(parentNodeId: string) {
        this.#parentNodeId = parentNodeId;
    }
    set title(title: string) {
        this.#title = title;
    }
    set type(type: string) {
        this.#type = type;
    }
    set pos(pos: { x: number; y: number }) {
        this.#pos.x = pos.x;
        this.#pos.y = pos.y;
    }
    set collapsed(collapsed: boolean) {
        this.#collapsed = collapsed;
    }
    set hasOutputNode(hasOutputNode: boolean) {
        this.#hasOutputNode = hasOutputNode;
    }
    set mode(mode: ComfyNodeMode) {
        this.#mode = mode;
    }
    set bgcolor(bgcolor: string | null) {
        this.#bgcolor = bgcolor;
    }
    addInput(id: string, slot: string) {
        this.#inputs.push({ id, slot });
    }
    addOutput(id: string, slot: string) {
        this.#outputs.push([{ id, slot }]);
    }
    addWidget(widget: ComfyGridWidget) {
        this.#widgets.push(widget);
    }
    set widgets(widgets: ComfyGridWidget[]) {
        this.#widgets.length = 0;
        this.#widgets.push(...widgets);
    }
    clearWidgets() {
        this.#widgets.length = 0;
    }
    set groups(groups: ComfyGridGroup[]) {
        this.#groups.length = 0;
        this.#groups.push(...groups);
    }
    addGroup(group: ComfyGridGroup) {
        this.#groups.push(group);
    }
    set properties(properties: P) {
        this.#properties = properties;
    }
    set comfyClass(comfyClass: string) {
        this.#comfyClass = comfyClass;
    }
    set constructorName(constructorName: string) {
        this.#constructorName = constructorName;
    }

    static sortNodesByPosition(nodes: ComfyGridNode[]): ComfyGridNode[] {
        return [...nodes].sort(ComfyGridNode.#compareNodesByPosition);
    }

    static #compareNodesByPosition(a: ComfyGridNode, b: ComfyGridNode): number {
        return comparePositions(a, b);
    }

    drawBackground() {
        this.#comfyNode.onDrawBackground?.();
    }

    updateNode() {
        workflowManager.handleUpdateNode({ nodeId: this.id });
    }

    setComfyUiProperty(key: string, value: unknown) {
        setNestedProperty(this as unknown as Record<string, unknown>, key, value);
    }
}

export class ComfyGridWidget<V = string, O = undefined> {
    readonly #comfyNode: ComfyNode;
    #comfyWidget: ComfyWidget;
    readonly #node: ComfyGridNode;
    #id: string = $state();
    #index: number = $state();
    #slot: number = $state();
    #label: string | undefined = $state();
    #name: string = $state();
    #tooltip: string | null = $state();
    #type: string = $state();
    #value: V = $state();
    #image: ImageInfo = $state({ filename: '', subfolder: '', type: '' });
    #element: HTMLElement = $state();
    #readonly: boolean = $state();
    #input: { id: string; slot: string } | null = $state();
    #options: O = $state();
    #className: string = $state();
    #textarea: HTMLTextAreaElement | null = null;
    #callback: (value?: unknown) => void;

    constructor(node: ComfyGridNode, widget: WidgetProps) {
        this.#comfyNode = widget.comfyNode;
        this.#comfyWidget = widget.comfyWidget;
        this.#node = node;
        this.#id = widget.id;
        this.#index = widget.index;
        this.#slot = widget.slot;
        this.#label = widget.label;
        this.#name = widget.name;
        this.#tooltip = widget.tooltip;
        this.#type = widget.type;
        this.#value = widget.value as V;
        this.#image = widget.image;
        this.#element = widget.element;
        this.#readonly = widget.readonly;
        this.#input = widget.input;
        this.#options = widget.options as O;
        this.#className = widget.className;
        this.#callback = widget.callback;
    }

    get comfyNode() {
        return this.#comfyNode;
    }
    get comfyWidget() {
        return this.#comfyWidget;
    }
    get node() {
        return this.#node;
    }
    get id() {
        return this.#id;
    }
    get index() {
        return this.#index;
    }
    get slot() {
        return this.#slot;
    }
    get label() {
        return this.#label;
    }
    get name() {
        return this.#name;
    }
    get tooltip() {
        return this.#tooltip;
    }
    get type() {
        return this.#type;
    }
    get value() {
        return this.#value;
    }
    get image() {
        return this.#image;
    }
    get element() {
        return this.#element;
    }
    get readonly() {
        return this.#readonly;
    }
    get input() {
        return this.#input;
    }
    get options() {
        return this.#options;
    }
    get className() {
        return this.#className;
    }
    get textarea() {
        return this.#textarea;
    }
    get callback() {
        return this.#callback;
    }

    set id(id: string) {
        this.#id = id;
    }
    set index(index: number) {
        this.#index = index;
    }
    set slot(slot: number) {
        this.#slot = slot;
    }
    set label(label: string | undefined) {
        this.#label = label;
    }
    set name(name: string) {
        this.#name = name;
    }
    set tooltip(tooltip: string | null) {
        this.#tooltip = tooltip;
    }
    set type(type: string) {
        this.#type = type;
    }
    set value(value: V) {
        this.#value = value;
    }
    set image(image: ImageInfo) {
        this.#image = { filename: '', subfolder: '', type: '', ...image };
    }
    set element(element: HTMLElement) {
        this.#element = element;
    }
    set readonly(readonly: boolean) {
        this.#readonly = readonly;
    }
    set input(input: { id: string; slot: string } | null) {
        this.#input = input;
    }
    set options(options: O) {
        this.#options = options;
    }
    set className(className: string) {
        this.#className = className;
    }
    set textarea(textarea: HTMLTextAreaElement) {
        this.#textarea = textarea;
    }
    set callback(callback: (value?: unknown) => void) {
        this.#callback = callback;
    }

    update(widget: WidgetProps) {
        this.#comfyWidget = widget.comfyWidget;
        this.#index = widget.index;
        this.#slot = widget.slot;
        this.#label = widget.label;
        this.#name = widget.name;
        this.#tooltip = widget.tooltip;
        this.#type = widget.type;
        this.#value = widget.value as V;
        this.#image = { filename: '', subfolder: '', type: '', ...widget.image };
        this.#readonly = widget.readonly;
        this.#input = widget.input;
        this.#options = widget.options as O;
        this.#className = widget.className;
        this.#callback = widget.callback;
    }

    #getContext(): WidgetContext {
        const canvas = appState.comfyUiState.app.canvas;
        const ctx: WidgetContext = { node: this.#comfyNode, widget: this.#comfyWidget, canvas };
        return ctx;
    }

    setComfyUiProperty(nestKey: string, value: unknown) {
        setNestedProperty(this as unknown as Record<string, unknown>, nestKey, value);
    }

    updateComfyUiValue(payload?: { value?: V }) {
        const value = payload?.value ?? this.#value;

        if (typeof this.#comfyWidget.setValue === 'function') {
            this.#comfyWidget.setValue?.(value, this.#getContext());
        } else {
            this.#comfyWidget.value = value;
        }
    }

    updateComfyUiSelect(payload?: { value?: V; addOptions?: string[] }) {
        const { addOptions } = payload ?? {};
        const value = payload?.value ?? this.#value;

        if (typeof this.#comfyWidget.setValue === 'function') {
            this.#comfyWidget.setValue?.(value, this.#getContext());
        } else {
            this.#comfyWidget.value = value;
        }

        // Add to combo options if provided
        if (addOptions && this.#comfyWidget.options?.values) {
            for (const opt of addOptions) {
                const values = this.#comfyWidget.options.values as string[];
                if (!values.includes(opt)) {
                    values.push(opt);
                }
            }
        }

        this.#comfyWidget.callback?.(this.#value);
    }

    clickComfyUiButton() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const widgetAny = this.#comfyWidget as any;
        if (typeof widgetAny.onClick === 'function') {
            (widgetAny.onClick as (ctx: WidgetContext) => void)(this.#getContext());
        }
    }
}

function setNestedProperty(obj: Record<string, unknown>, nestKey: string, value: unknown): void {
    const keys = nestKey.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (current[key] === undefined) {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }
    const key = keys.at(-1);
    if (key) {
        current[key] = value;
    }
}
