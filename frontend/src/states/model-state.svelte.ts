import { SvelteSet } from 'svelte/reactivity';
import { getWidgetComponentWithMeta } from '@/components/widgets/comfyui/registry/widget-registry';
import { workflowManager } from '@/managers/workflow-manager';
import type { ComfyApp, ComfyGroup, ComfyNode, ComfyWidget } from '@/types/comfy-model';
import type { ComfyNodeMode, ImageInfo, WidgetContext } from '@/types/model-shared';
import { appState } from './app-state.svelte';

function safeClone<T>(obj: T): T {
    if (obj == null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return [...obj] as unknown as T;
    return { ...obj };
}

function isNodeInGroup(node: ComfyNode, group: ComfyGroup): boolean {
    if (!node || !group?.boundingRect) return false;

    let [nx, ny, nw, nh] = typeof node.getBounding === 'function' ? node.getBounding() : [0, 0, 0, 0];
    if (nw <= 0 || nh <= 0) {
        nx = node.pos ? node.pos[0] : nx;
        ny = node.pos ? node.pos[1] : ny;
        nw = node.size ? node.size[0] : 100;
        nh = node.size ? node.size[1] : 100;
    }
    const nodeArea = nw * nh;
    if (nodeArea <= 0) return false;

    const [gx, gy, gw, gh] = group.boundingRect;
    const overlapWidth = Math.max(0, Math.min(nx + nw, gx + gw) - Math.max(nx, gx));
    const overlapHeight = Math.max(0, Math.min(ny + nh, gy + gh) - Math.max(ny, gy));
    const overlapArea = overlapWidth * overlapHeight;

    return overlapArea >= nodeArea / 2;
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
            return comparePositions(a, b);
        }
    }

    readonly isTabify = $derived.by(() => {
        const groupTabify = appState.optionState.get('ComfyGrid.ui.group_tabify') ?? 'all_top_groups';
        if (groupTabify === 'all_top_groups') {
            return Boolean(this.#id);
        }
        return false;
    });

    readonly titlePriority = $derived.by(() => {
        if (this.#title.startsWith('#')) return -1;
        if (this.#title.startsWith('?')) return 1;
        return 0;
    });

    readonly hasVisibleNodes = $derived.by(() => {
        if (this.#nodes.some((node) => node.isGroupVisible)) {
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
        for (const node of this.allNodes) {
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
    readonly allNodes = $derived.by<ComfyGridNode[]>(() => {
        return [...this.#nodes, ...this.#children.flatMap((child) => child.allNodes)];
    });
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

export class ComfyGridNode {
    readonly #comfyNode: ComfyNode;
    #title: string = $state();
    #collapsed: boolean = $state();
    #mode: ComfyNodeMode = $state();
    #bgcolor: string | null = $state();
    readonly #widgets: ComfyGridWidget[] = $state([]);
    readonly #groups: ComfyGridGroup[] = [];
    readonly #comfyGroups: ComfyGroup[] = [];

    readonly isGroupVisible = $derived.by(() => {
        const layout = appState.workspaceState.layout;
        if (layout.floatingNodes.get(this.id)) {
            return false;
        }

        if (appState.workspaceState.hasErrorNode(this.id)) {
            return true;
        }

        const showRenderableLessNodes = layout.showRenderableLessNodes ?? false;
        const showControlLessNodes = layout.showControlLessNodes ?? false;
        const showCollapsedNodes = layout.showCollapsedNodes ?? false;
        const showNoteNodes = layout.showNoteNodes ?? false;

        if (!showRenderableLessNodes) {
            if (this.widgets.length > 0) {
                const renderable = this.widgets.some((w) => getWidgetComponentWithMeta(this, w));
                if (!renderable) {
                    return false;
                }
            }
        }
        if (!showControlLessNodes) {
            const containsWidgets = this.#widgets.filter((w) => !layout.floatingWidgets.get(w.id));
            if (containsWidgets.length === 0) {
                return false;
            }
        }
        if (!showCollapsedNodes && this.#collapsed) {
            return false;
        }
        if (!showNoteNodes && this.isNote) {
            return false;
        }
        return true;
    });

    readonly isVisible = $derived.by(() => {
        const isFloating = Boolean(appState.workspaceState.layout.floatingNodes.get(this.id));
        return isFloating || this.isGroupVisible;
    });

    constructor(comfyNode: ComfyNode, app: ComfyApp) {
        this.#comfyNode = comfyNode;
        this.#title = comfyNode.title;
        this.#collapsed = comfyNode.collapsed;
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
    }

    #buildWidgetConfigList(): Array<{
        widget: ComfyWidget;
        index: number;
        image?: ImageInfo;
        overrides?: { type?: string; callback?: (value?: unknown) => void };
    }> {
        const comfyNode = this.#comfyNode;
        const images = comfyNode.images || [];
        const result: Array<{ widget: ComfyWidget; index: number; image?: ImageInfo; overrides?: { type?: string; callback?: (value?: unknown) => void } }> =
            [];
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
                        index: index++,
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
                            index: index++,
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
                            index: index++,
                            image: images[imgIdx],
                            overrides: { type: overrideType, callback: comfyNode.pasteFiles },
                        });
                        imgIdx++;
                    }
                } else {
                    result.push({ widget: w, index: index++ });
                }
            } else if (w.constructor.name === 'ImagePreviewWidget') {
                if (comfyNode.widgets.length === 1 && comfyNode.outputs.length === 0) {
                    result.push({ widget: w, index: index++, image: images[imgIdx] });
                }
                imgIdx++;
            } else {
                result.push({ widget: w, index: index++ });
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
        const unusedWidgets = [...this.#widgets];
        const newWidgets: ComfyGridWidget[] = [];
        const configs = this.#buildWidgetConfigList();
        for (const config of configs) {
            const targetType = config.overrides?.type ?? config.widget.type;
            const existingIdx = unusedWidgets.findIndex((w) => w.comfyWidget === config.widget && w.type === targetType);
            if (existingIdx !== -1) {
                const existing = unusedWidgets[existingIdx];
                unusedWidgets.splice(existingIdx, 1);
                existing.update(app, config.index, config.image, config.overrides);
                newWidgets.push(existing);
            } else {
                const newWidget = new ComfyGridWidget(app, this, config.widget, config.index, config.image, config.overrides);
                newWidgets.push(newWidget);
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
        return this.#comfyNode.type;
    }
    get pos(): Readonly<{ x: number; y: number }> {
        return { x: this.#comfyNode.pos[0], y: this.#comfyNode.pos[1] };
    }
    get collapsed() {
        return this.#collapsed;
    }
    get hasOutputNode() {
        return this.#comfyNode.constructor.nodeData?.output_node;
    }
    get mode() {
        return this.#mode;
    }
    get bgcolor() {
        return this.#bgcolor;
    }
    get isNote() {
        return this.type.endsWith('Note');
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
    get comfyClass() {
        return this.#comfyNode.constructor.comfyClass;
    }
    get constructorName() {
        return this.#comfyNode.constructor.name;
    }
    get properties() {
        return this.#comfyNode.properties;
    }
    get isOutputNode() {
        return Boolean(this.#comfyNode.constructor.nodeData?.output_node);
    }

    set title(title: string) {
        this.#title = title;
        this.#comfyNode.title = title;
    }
    set collapsed(collapsed: boolean) {
        this.#collapsed = collapsed;
        this.#comfyNode.collapsed = collapsed;
    }
    set mode(mode: ComfyNodeMode) {
        this.#mode = mode;
        this.#comfyNode.mode = mode as 0 | 1 | 2 | 3;
    }
    set bgcolor(bgcolor: string | null) {
        this.#bgcolor = bgcolor;
        this.#comfyNode.bgcolor = bgcolor;
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

    static sortNodesByPosition(nodes: ComfyGridNode[]): ComfyGridNode[] {
        return [...nodes].sort(comparePositions);
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

    onDrawBackground() {
        this.#comfyNode.onDrawBackground?.();
    }

    updateNode(options?: { silent?: boolean }) {
        workflowManager.handleUpdateNode({ nodeId: this.id, silent: options?.silent });
    }
}

export class ComfyGridWidget<V = string, O = undefined> {
    readonly #comfyWidget: ComfyWidget;
    readonly #node: ComfyGridNode;
    #index: number = $state();
    #label: string | undefined = $state();
    #name: string = $state();
    #type: string = $state();
    #value: V = $state();
    #rawValue: string = $state();
    #image: ImageInfo = $state({ filename: '', subfolder: '', type: '' });
    #element: HTMLElement | null = $state();
    #input: { id: string; slot: string } | null = $state();
    #options: O = $state();
    #textarea: HTMLTextAreaElement | null = null;
    #isTranslating: boolean = $state(false);
    #translationFailed: boolean = $state(false);
    #isDirty: boolean = $state(false);
    triggerTranslation?: (text?: string) => Promise<void>;
    #callback: (value?: unknown) => void;

    constructor(
        app: ComfyApp,
        node: ComfyGridNode,
        comfyWidget: ComfyWidget,
        index: number,
        image?: ImageInfo,
        overrides?: { type?: string; callback?: (value?: unknown) => void },
    ) {
        this.#node = node;
        this.#comfyWidget = comfyWidget;
        this.update(app, index, image, overrides);
    }

    get node() {
        return this.#node;
    }
    get comfyWidget() {
        return this.#comfyWidget;
    }
    get index() {
        return this.#index;
    }
    get id() {
        return `${this.#node.comfyNode.id}_${this.#index}`;
    }
    get label() {
        return this.#label;
    }
    get name() {
        return this.#name;
    }
    get tooltip() {
        return this.#node.comfyNode.constructor.nodeData?.inputs?.[this.#comfyWidget.name]?.tooltip ?? null;
    }
    get type() {
        return this.#type;
    }
    get value() {
        return this.#value;
    }
    get rawValue() {
        return this.#rawValue;
    }
    get image() {
        return this.#image;
    }
    get element() {
        return this.#element;
    }
    get placeholder() {
        return (this.#element as HTMLInputElement)?.placeholder || '';
    }
    get readonly() {
        return (this.#element as HTMLInputElement)?.readOnly || false;
    }
    get input() {
        return this.#input;
    }
    get options() {
        return this.#options;
    }
    get className() {
        return this.#comfyWidget.constructor.name;
    }
    get textarea() {
        return this.#textarea;
    }
    get isTranslating() {
        return this.#isTranslating;
    }
    get translationFailed() {
        return this.#translationFailed;
    }
    get isDirty() {
        return this.#isDirty;
    }
    get callback() {
        return this.#callback;
    }

    set label(label: string | undefined) {
        this.#label = label;
    }
    set name(name: string) {
        this.#name = name;
    }
    set type(type: string) {
        this.#type = type;
    }
    set value(value: V) {
        this.#value = value;
    }
    set rawValue(rawValue: string | undefined) {
        this.#rawValue = rawValue;
    }
    set image(image: ImageInfo) {
        this.#image = { filename: '', subfolder: '', type: '', ...image };
    }
    set textarea(textarea: HTMLTextAreaElement) {
        this.#textarea = textarea;
    }
    set isTranslating(isTranslating: boolean) {
        this.#isTranslating = isTranslating;
    }
    set translationFailed(translationFailed: boolean) {
        this.#translationFailed = translationFailed;
    }
    set isDirty(isDirty: boolean) {
        this.#isDirty = isDirty;
    }

    update(app: ComfyApp, index: number, image?: ImageInfo, overrides?: { type?: string; callback?: (value?: unknown) => void }) {
        const widgetInput = this.#node.comfyNode.inputs?.find((i) => i.widget?.name === this.#comfyWidget.name);
        let input: { id: string; slot: string } | null = null;
        if (widgetInput) {
            const link = app.rootGraph.getLink?.(widgetInput.link);
            if (link) {
                input = { id: String(link.origin_id), slot: String(link.origin_slot) };
            }
        }

        this.#index = index;
        this.#label = this.#comfyWidget.label;
        this.#name = this.#comfyWidget.name;
        this.#type = overrides?.type ?? this.#comfyWidget.type;
        this.#value = (typeof this.#comfyWidget.value === 'object' ? safeClone(this.#comfyWidget.value) : this.#comfyWidget.value) as V;
        this.#rawValue = this.#node.comfyNode.properties.rawValues?.[this.#index] ?? this.#value;
        this.#image = image ? { filename: '', subfolder: '', type: '', ...image } : { filename: '', subfolder: '', type: '' };
        this.#element = this.#comfyWidget.inputEl || this.#comfyWidget.element || null;
        this.#input = input;

        const options = safeClone(this.#comfyWidget.options) as Record<string, unknown>;
        if (this.#comfyWidget.type === 'combo') {
            options['values'] = [
                ...((typeof this.#comfyWidget.options?.values === 'function' ? this.#comfyWidget.options.values() : this.#comfyWidget.options?.values) ?? []),
            ];
            options['fixed_values'] = ComfyGridWidget.#computeFixedValues(this.#comfyWidget);
        }
        this.#options = options as O;
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
        return {
            node: this.#node.comfyNode,
            widget: this.#comfyWidget,
            canvas: appState.comfyUiState.app.canvas,
        };
    }

    updateValue(payload?: { value?: V }) {
        const value = payload?.value ?? this.#value;

        if (typeof this.#comfyWidget.setValue === 'function') {
            this.#comfyWidget.setValue?.(value, this.#getContext());
        } else {
            this.#comfyWidget.value = value;
        }
    }

    updateRawValue(payload?: { rawValue?: V }) {
        const rawValue = payload?.rawValue;

        if (rawValue === undefined) {
            if (this.#node.comfyNode.properties.rawValues) {
                delete this.#node.comfyNode.properties.rawValues[this.#index];
            }
            return;
        }
        if (!this.#node.comfyNode.properties.rawValues) {
            this.#node.comfyNode.properties.rawValues = {};
        }
        this.#node.comfyNode.properties.rawValues[this.#index] = rawValue;
    }

    updateSelect(payload?: { value?: V; addOptions?: string[] }) {
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

    clickButton() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const widgetAny = this.#comfyWidget as any;
        if (typeof widgetAny.onClick === 'function') {
            (widgetAny.onClick as (ctx: WidgetContext) => void)(this.#getContext());
        }
        workflowManager.handleUpdateNode({ nodeId: this.id });
    }

    onDrawBackground() {
        this.#node.onDrawBackground?.();
    }
}
