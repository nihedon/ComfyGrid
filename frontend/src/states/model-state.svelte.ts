import { SvelteSet } from 'svelte/reactivity';
import { workflowManager } from '@/managers/workflow-manager';
import type { ComfyApp, ComfyGroup, ComfyNode, ComfyWidget } from '@/types/comfy-model';
import type { ComfyNodeMode, ImageInfo, WidgetContext } from '@/types/model-shared';
import { appState } from './app-state.svelte';

function safeParse<T>(obj: T): T {
    const seen = new WeakSet();
    return JSON.parse(
        JSON.stringify(obj, (_key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return undefined;
                seen.add(value);
            }
            return value;
        }),
    );
}

function isNodeInGroup(node: ComfyNode, group: ComfyGroup): boolean {
    const [nx, ny, nw, nh] = node.getBounding();
    const [gx, gy, gw, gh] = group.boundingRect;
    const nodeArea = nw * nh;
    const overlapWidth = Math.max(0, Math.min(nx + nw, gx + gw) - Math.max(nx, gx));
    const overlapHeight = Math.max(0, Math.min(ny + nh, gy + gh) - Math.max(ny, gy));
    return overlapWidth * overlapHeight >= nodeArea / 2;
}

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

    constructor(comfyGroup: ComfyGroup | null, options?: { expanded?: boolean }) {
        this.#comfyGroup = comfyGroup;
        this.#id = comfyGroup?.id != null ? String(comfyGroup.id) : undefined;
        this.#title = comfyGroup?.title ?? 'Ungrouped';
        this.clearChildren();
        this.clearNodes();
        this.#color = comfyGroup?.color ?? null;
        this.#pos = comfyGroup ? { x: comfyGroup.boundingRect[0], y: comfyGroup.boundingRect[1] } : { x: 0, y: 0 };
        this.#expanded = options?.expanded ?? false;
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

    readonly isExecuting = $derived.by(() => {
        if (this.#nodes.some((n) => appState.executionState.runningNodeId === n.id)) return true;
        return this.#children.some((child) => child.isExecuting);
    });

    readonly hasError = $derived.by(() => {
        if (this.#nodes.some((n) => appState.workspaceState.hasErrorNode(n.id))) return true;
        return this.#children.some((child) => child.hasError);
    });

    readonly modeSet = $derived.by(() => {
        const modes = new SvelteSet<ComfyNodeMode>();
        for (const node of this.#nodes) {
            modes.add(node.mode);
        }
        return modes;
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
        if (this.#comfyGroup) {
            this.#comfyGroup.title = title;
        }
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
        if (this.#comfyGroup) {
            this.#comfyGroup.color = color;
        }
    }
    set expanded(expanded: boolean) {
        this.#expanded = expanded;
    }
}

export class ComfyGridNode<P = undefined> {
    readonly #comfyNode: ComfyNode;
    #title: string = $state();
    #type: string = $state();
    readonly #pos: { x: number; y: number } = $state();
    #collapsed: boolean = $state();
    #hasOutputNode: boolean = false;
    #mode: ComfyNodeMode = $state();
    #bgcolor: string | null = $state();
    readonly #widgets: ComfyGridWidget[] = $state([]);
    readonly #groups: ComfyGridGroup[] = [];
    readonly #comfyGroups: ComfyGroup[] = [];
    #properties: P = $state();

    constructor(comfyNode: ComfyNode, app: ComfyApp) {
        this.#comfyNode = comfyNode;
        this.#title = comfyNode.title;
        this.#type = comfyNode.type;
        this.#pos = { x: comfyNode.pos[0], y: comfyNode.pos[1] };
        this.#collapsed = comfyNode.collapsed;
        this.#hasOutputNode = comfyNode.constructor.nodeData?.output_node;
        this.#mode = comfyNode.mode as ComfyNodeMode;
        this.#bgcolor = comfyNode.bgcolor;

        this.updateWidgets(app);

        const groups = app.rootGraph.groups
            .filter((g) => isNodeInGroup(comfyNode, g))
            .sort((a, b) => {
                const [, , aw, ah] = a.boundingRect;
                const [, , bw, bh] = b.boundingRect;
                return bw * bh - aw * ah;
            });
        this.#comfyGroups.length = 0;
        this.#comfyGroups.push(...groups);
        this.#groups.length = 0;
        for (const group of this.#comfyGroups) {
            this.#groups.push(new ComfyGridGroup(group));
        }

        this.#properties = (typeof comfyNode.properties === 'object' ? safeParse(comfyNode.properties) : comfyNode.properties) as P;
    }

    static #buildWidgetConfigList(
        comfyNode: ComfyNode,
    ): Array<{ widget: ComfyWidget; idx: number; image?: ImageInfo; overrides?: { type?: string; callback?: (value?: unknown) => void } }> {
        const images = comfyNode.images || [];
        const result: Array<{ widget: ComfyWidget; idx: number; image?: ImageInfo; overrides?: { type?: string; callback?: (value?: unknown) => void } }> = [];
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const skipIndexSet = new Set<number>();
        let index = 0;
        let imgIdx = 0;

        const isUploadButton = (w: ComfyWidget) => w.name === 'upload' || (w.type === 'button' && w.name.toLowerCase().includes('upload'));

        for (const [i, w] of Object.entries(comfyNode.widgets ?? [])) {
            const idx = Number.parseInt(i);
            if (skipIndexSet.has(idx)) continue;
            if (comfyNode.inputs?.find((inp) => inp.name == w.name)?.link != null) continue;
            if (w.disabled || w.element?.disabled) continue;

            if (w.type === 'combo' && (w.name === 'file' || w.name === 'image' || w.name === 'video' || w.name === 'audio')) {
                const [findIdx, uploadButtonWidget] = Object.entries(comfyNode.widgets).find(([, w]) => isUploadButton(w)) ?? ['', undefined];
                if (uploadButtonWidget) {
                    skipIndexSet.add(Number.parseInt(findIdx));
                    result.push({
                        widget: w,
                        idx: index++,
                        image: images[imgIdx],
                        overrides: { type: 'upload', callback: uploadButtonWidget.callback },
                    });

                    const [pIdx, previewWidget] = Object.entries(comfyNode.widgets).find(
                        ([, w]) => w.constructor.name === 'ImagePreviewWidget' || w.type === 'preview' || w.name === 'video-preview' || w.type === 'audioUI',
                    ) ?? ['', undefined];
                    if (w.name === 'audio' || comfyNode.previewMediaType === 'audio') {
                        if (previewWidget) skipIndexSet.add(Number.parseInt(pIdx));
                        result.push({
                            widget: w,
                            idx: index++,
                            overrides: { type: 'audio', callback: comfyNode.pasteFiles },
                        });
                    } else if (comfyNode.images?.length > 0) {
                        if (previewWidget) skipIndexSet.add(Number.parseInt(pIdx));
                        let overrideType: string | undefined;
                        if (w.name === 'image' || comfyNode.previewMediaType === 'image') {
                            overrideType = 'image';
                        } else if (w.name === 'video' || comfyNode.previewMediaType === 'video') {
                            overrideType = 'video';
                        }
                        result.push({
                            widget: w,
                            idx: index++,
                            image: images[imgIdx],
                            overrides: { type: overrideType, callback: comfyNode.pasteFiles },
                        });
                        imgIdx++;
                    }
                } else {
                    result.push({ widget: w, idx: index++ });
                }
            } else if (w.constructor.name === 'ImagePreviewWidget') {
                if (comfyNode.widgets.length === 1 && comfyNode.outputs.length === 0) {
                    result.push({ widget: w, idx: index++, image: images[imgIdx] });
                }
                imgIdx++;
            } else {
                result.push({ widget: w, idx: index++ });
            }
        }

        const linkMap: Record<string, number | null | undefined> = {};
        comfyNode.inputs
            ?.filter((slot) => slot.widget != null)
            .forEach((slot) => {
                if (slot.widget) linkMap[slot.widget.name] = slot.link;
            });

        return result.filter((item) => linkMap[item.widget.name] == null);
    }

    updateWidgets(app: ComfyApp) {
        const configs = ComfyGridNode.#buildWidgetConfigList(this.#comfyNode);
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const existingMap = new Map(this.#widgets.map((w) => [w.comfyWidget, w]));
        const newWidgets: ComfyGridWidget[] = [];
        for (const config of configs) {
            const existing = existingMap.get(config.widget);
            if (existing) {
                existing.update(app, config.idx, config.image, config.overrides);
                newWidgets.push(existing);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                newWidgets.push(new ComfyGridWidget(app, this as ComfyGridNode<any>, config.widget, config.idx, config.image, config.overrides));
            }
        }
        this.#widgets.length = 0;
        this.#widgets.push(...newWidgets);
    }

    get comfyNode() {
        return this.#comfyNode;
    }
    get id() {
        return String(this.#comfyNode.id);
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
    get widgets() {
        return this.#widgets;
    }
    get comfyGroups(): ReadonlyArray<ComfyGroup> {
        return this.#comfyGroups;
    }
    get groups() {
        return this.#groups;
    }
    get properties() {
        return this.#properties;
    }
    get comfyClass() {
        return this.#comfyNode.constructor.comfyClass;
    }
    get constructorName() {
        return this.#comfyNode.constructor.name;
    }

    set title(title: string) {
        this.#title = title;
        if (this.#comfyNode) {
            this.#comfyNode.title = title;
        }
    }
    set type(type: string) {
        this.#type = type;
        if (this.#comfyNode) {
            this.#comfyNode.type = type;
        }
    }
    set collapsed(collapsed: boolean) {
        this.#collapsed = collapsed;
        if (this.#comfyNode) {
            this.#comfyNode.collapsed = collapsed;
        }
    }
    set hasOutputNode(hasOutputNode: boolean) {
        this.#hasOutputNode = hasOutputNode;
    }
    set mode(mode: ComfyNodeMode) {
        this.#mode = mode;
        if (this.#comfyNode) {
            this.#comfyNode.mode = mode as 0 | 1 | 2 | 3;
        }
    }
    set bgcolor(bgcolor: string | null) {
        this.#bgcolor = bgcolor;
        if (this.#comfyNode) {
            this.#comfyNode.bgcolor = bgcolor;
        }
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

    static sortNodesByPosition(nodes: ComfyGridNode[]): ComfyGridNode[] {
        return [...nodes].sort(ComfyGridNode.#compareNodesByPosition);
    }

    static #compareNodesByPosition(a: ComfyGridNode, b: ComfyGridNode): number {
        return comparePositions(a, b);
    }

    static *subgraphNodes(app: ComfyApp, parent: ComfyGridNode): Generator<ComfyGridNode> {
        if (parent.comfyNode?.subgraph && parent.comfyNode?.id != null) {
            for (const comfyNode of parent.comfyNode.subgraph.nodes) {
                if (comfyNode.id) {
                    const node = new ComfyGridNode(comfyNode, app);
                    yield node;
                    yield* ComfyGridNode.subgraphNodes(app, node);
                }
            }
        }
    }

    drawBackground() {
        this.#comfyNode.onDrawBackground?.();
    }

    updateNode() {
        workflowManager.handleUpdateNode({ nodeId: this.id });
    }

    setComfyUiProperty(key: string, value: unknown) {
        this.comfyNode[key] = value;
        // setNestedProperty(this as unknown as Record<string, unknown>, key, value);
    }
}

export class ComfyGridWidget<V = string, O = undefined> {
    readonly #comfyNode: ComfyNode;
    readonly #comfyWidget: ComfyWidget;
    readonly #node: ComfyGridNode;
    #id: string = $state();
    #index: number = $state();
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

    constructor(
        app: ComfyApp,
        node: ComfyGridNode,
        widget: ComfyWidget,
        idx: number,
        image?: ImageInfo,
        overrides?: { type?: string; callback?: (value?: unknown) => void },
    ) {
        this.#comfyNode = node.comfyNode;
        this.#comfyWidget = widget;
        this.#node = node;
        this.update(app, idx, image, overrides);
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

    update(app: ComfyApp, idx: number, image?: ImageInfo, overrides?: { type?: string; callback?: (value?: unknown) => void }) {
        const widgetInput = this.#comfyNode.inputs?.find((i) => i.widget?.name === this.#comfyWidget.name);
        let input: { id: string; slot: string } | null = null;
        if (widgetInput) {
            const link = app.rootGraph.getLink?.(widgetInput.link);
            if (link) {
                input = { id: String(link.origin_id), slot: String(link.origin_slot) };
            }
        }

        this.#id = `${this.#comfyNode.id}_${idx}`;
        this.#index = idx;
        this.#label = this.#comfyWidget.label;
        this.#name = this.#comfyWidget.name;
        this.#tooltip = this.#comfyNode.constructor.nodeData?.inputs?.[this.#comfyWidget.name]?.tooltip ?? null;
        this.#type = overrides?.type ?? this.#comfyWidget.type;
        this.#value = (typeof this.#comfyWidget.value === 'object' ? safeParse(this.#comfyWidget.value) : this.#comfyWidget.value) as V;
        this.#image = image ? { filename: '', subfolder: '', type: '', ...image } : { filename: '', subfolder: '', type: '' };
        this.#element = this.#comfyWidget.inputEl || this.#comfyWidget.element || null;
        this.#readonly = this.#comfyWidget.inputEl?.readOnly || this.#comfyWidget.element?.readOnly || false;
        this.#input = input;

        const options = safeParse(this.#comfyWidget.options) as Record<string, unknown>;
        if (this.#comfyWidget.type === 'combo') {
            options['values'] = [
                ...((typeof this.#comfyWidget.options?.values === 'function' ? this.#comfyWidget.options.values() : this.#comfyWidget.options?.values) ?? []),
            ];
            options['fixed_values'] = ComfyGridWidget.#computeFixedValues(this.#comfyWidget);
        }
        this.#options = options as O;
        this.#className = this.#comfyWidget.constructor.name;
        this.#callback = overrides?.callback ?? this.#comfyWidget.callback;
    }

    static #computeFixedValues(widget: ComfyWidget): string[] {
        const descriptor = Object.getOwnPropertyDescriptor(widget, 'value');
        const valGetter = descriptor?.get;
        const results: string[] = [];
        if (valGetter) {
            const strValGetter = valGetter.toString();
            const match = strValGetter.match(/return\s+(?:'([^']+?)'|"([^"]*?)"|`([^`]*?)`)\s*;/);
            if (match) {
                for (let i = 1; i < match.length; i++) {
                    if (match[i] !== undefined) results.push(match[i]);
                }
            }
        }
        return results;
    }

    #getContext(): WidgetContext {
        const canvas = appState.comfyUiState.app.canvas;
        const ctx: WidgetContext = { node: this.#comfyNode, widget: this.#comfyWidget, canvas };
        return ctx;
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
