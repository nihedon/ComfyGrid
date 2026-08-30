/* eslint-disable @typescript-eslint/no-explicit-any */

const templateDocCache = (globalThis.__COMFYGRID_TEMPLATE_CACHE__ ??= new Map<string, Document>());

export async function loadExtensionTemplate(extensionName: string, templateFile = 'template.html'): Promise<Document> {
    const cacheKey = `${extensionName}/${templateFile}`;
    if (templateDocCache.has(cacheKey)) {
        return templateDocCache.get(cacheKey)!;
    }

    const response = await fetch(`/comfygrid/api/extensions/${extensionName}/assets/${templateFile}`);
    if (!response.ok) {
        throw new Error(`Failed to load template file: ${templateFile} for extension: ${extensionName}`);
    }

    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    templateDocCache.set(cacheKey, doc);
    return doc;
}

export function getNestedProperty(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
    }
    return current;
}

export function setNestedProperty(obj: any, path: string, value: any): void {
    if (!obj || !path) return;
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] == null || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
}

/**
 * Base Web Component class for building ComfyGrid custom widgets with zero boilerplate.
 */
export class ComfyGridWidget extends HTMLElement {
    static extension?: string;
    static template?: string; // e.g. "lora.html" or "lora.html#power-lora-item"
    static sortable = false;
    static sortHandle = '.cg-sort-handle, .comfygrid-lora-handle, [data-role="handle"], [data-sort-handle]';

    #widget: any = null;
    #isInitialized = false;
    #unsubscribe: (() => void) | null = null;
    #boundElements: Array<{ el: HTMLElement; path: string; isCombo: boolean }> = [];

    get widget() {
        return this.#widget;
    }
    get node() {
        return this.#widget?.node;
    }
    get comfyNode() {
        return this.#widget?.node?.comfyNode;
    }
    get comfyWidget() {
        return this.#widget?.comfyWidget;
    }

    set widget(value: any) {
        this.#widget = value;
        if (this.#isInitialized && this.isConnected) {
            this.sync();
        } else if (this.isConnected && !this.#isInitialized && this.#widget) {
            void this.init();
        }
    }

    connectedCallback() {
        if (this.#widget && !this.#isInitialized) {
            void this.init();
        }
    }

    disconnectedCallback() {
        this.#unsubscribe?.();
        this.#unsubscribe = null;
        this.#isInitialized = false;
        this.onDestroy();
    }

    async init(): Promise<void> {
        if (this.#isInitialized || !this.#widget) return;

        await this.#renderTemplate();
        if (!this.isConnected || !this.#widget) return;

        this.#isInitialized = true;
        this.#setupAutoBindings();
        this.#setupAutoActions();
        if ((this.constructor as typeof ComfyGridWidget).sortable) {
            this.#setupSortable();
        }

        this.sync();
        this.#subscribeNodeChanges();
        this.onInit();
    }

    async #renderTemplate(): Promise<void> {
        const ctor = this.constructor as typeof ComfyGridWidget;
        const templateSpec = ctor.template;
        if (!templateSpec) return;

        let fileName: string;
        let templateId: string | null = null;

        if (templateSpec.includes('#')) {
            const [file, id] = templateSpec.split('#');
            fileName = file || 'template.html';
            templateId = id;
        } else {
            fileName = templateSpec;
        }

        const extensionName = ctor.extension || this.tagName.toLowerCase().split('-')[0] || '';
        const doc = await loadExtensionTemplate(extensionName, fileName);
        const templateEl = templateId ? doc.getElementById(templateId) : doc.querySelector('template') || doc.body;

        if (!templateEl) {
            throw new Error(`Template not found: ${templateSpec}`);
        }

        const lit = (globalThis as any).litHtml;
        const htmlContent = (templateEl as HTMLTemplateElement).innerHTML || templateEl.innerHTML;
        if (lit?.unsafeHTML && lit?.render) {
            lit.render(lit.unsafeHTML(htmlContent), this);
        } else {
            this.innerHTML = htmlContent;
        }
    }

    #setupAutoBindings(): void {
        this.#boundElements = [];
        const bindableNodes = this.querySelectorAll<HTMLElement>('[bind], [data-bind]');

        for (const el of bindableNodes) {
            const path = el.getAttribute('bind') || el.getAttribute('data-bind');
            if (!path) continue;

            const isCombo = el.tagName.toLowerCase() === 'cg-modal-combo-widget';
            this.#boundElements.push({ el, path, isCombo });

            if (isCombo) {
                this.#setupComboElement(el, path);
            } else if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') {
                    el.addEventListener('change', () => {
                        this.setValue(path, el.checked);
                    });
                } else if (el.type === 'number') {
                    el.addEventListener('input', () => {
                        const num = Number.parseFloat(el.value);
                        this.setValue(path, Number.isNaN(num) ? 0 : num);
                    });
                } else {
                    el.addEventListener('input', () => {
                        this.setValue(path, el.value);
                    });
                }
            } else if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
                el.addEventListener('change', () => {
                    this.setValue(path, el.value);
                });
            }
        }
    }

    #setupComboElement(comboEl: any, path: string): void {
        const widget = this.#widget;
        if (!widget) return;

        const fakeWidget = {
            id: widget.id || `combo_${widget.name}_${widget.index}`,
            name: widget.name,
            get options() {
                const api = (globalThis as any).api;
                const models = api ? (api.getModels('loras') ?? []).map((m: any) => m.path) : [];
                return { values: models, fixed_values: [] };
            },
            node: this.node,
            get value() {
                return getNestedProperty(widget, path) ?? '';
            },
            set value(v: any) {
                setNestedProperty(widget, path, v);
                if (widget.comfyWidget) {
                    widget.comfyWidget.value = typeof widget.value === 'object' ? { ...widget.value } : widget.value;
                    widget.comfyWidget.setLora?.(v);
                }
                widget.node?.updateNode({ silent: true });
            },
            _node: this.node,
        };

        comboEl.widget = fakeWidget;
    }

    #setupAutoActions(): void {
        const actionNodes = this.querySelectorAll<HTMLElement>('[action], [data-action]');
        for (const el of actionNodes) {
            const action = el.getAttribute('action') || el.getAttribute('data-action');
            if (action === 'remove' || action === 'delete') {
                el.addEventListener('click', () => {
                    this.removeSelf();
                });
            }
        }
    }

    #setupSortable(): void {
        const container = this.closest('.widget-stack');
        const $ = (globalThis as any).jQuery;
        if (!container || !$?.fn?.sortable) return;

        if (!container.classList.contains('ui-sortable')) {
            const ctor = this.constructor as typeof ComfyGridWidget;
            const tagName = this.tagName.toLowerCase();

            $(container).sortable({
                items: tagName,
                handle: ctor.sortHandle,
                axis: 'y',
                cursor: 'grabbing',
                tolerance: 'pointer',
                distance: 4,
                update: () => {
                    const comfyNode = this.comfyNode;
                    if (!comfyNode?.widgets) return;

                    const renderedItems = Array.from(container.querySelectorAll(tagName)) as ComfyGridWidget[];
                    const sortedComfyWidgets: any[] = [];

                    for (const item of renderedItems) {
                        if (item.comfyWidget) {
                            sortedComfyWidgets.push(item.comfyWidget);
                        }
                    }

                    $(container).sortable('cancel');

                    let sortedIndex = 0;
                    comfyNode.widgets = comfyNode.widgets.map((w: any) => {
                        if (sortedComfyWidgets.includes(w)) {
                            return sortedComfyWidgets[sortedIndex++];
                        }
                        return w;
                    });

                    this.node?.updateNode();
                },
            });
        }
    }

    #subscribeNodeChanges(): void {
        const api = (globalThis as any).api;
        const nodeId = this.node?.id;
        if (api?.subscribe && nodeId) {
            this.#unsubscribe?.();
            this.#unsubscribe = api.subscribe(nodeId, (node: any) => {
                if (!this.isConnected) return;
                this.#widget = node.widgets?.[this.#widget?.index];
                this.sync();
            });
        }
    }

    /**
     * Syncs bound DOM elements with current widget state.
     */
    sync(): void {
        if (!this.#widget || !this.isConnected) return;

        for (const { el, path, isCombo } of this.#boundElements) {
            const val = getNestedProperty(this.#widget, path);
            if (isCombo) {
                this.#setupComboElement(el, path);
            } else if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') {
                    el.checked = Boolean(val);
                } else {
                    el.value = val != null ? String(val) : '';
                }
            } else if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
                el.value = val != null ? String(val) : '';
            }
        }

        this.onSync(this.#widget.value);
    }

    /**
     * Sets value and triggers auto update & callbacks.
     */
    setValue(path: string, val: any, silent = true): void {
        if (!this.#widget) return;
        setNestedProperty(this.#widget, path, val);

        if (this.comfyWidget && typeof this.#widget.value === 'object') {
            this.comfyWidget.value = { ...this.#widget.value };
        }

        this.onValueChange(path, val);
        this.save(silent);
    }

    /**
     * Saves node state to ComfyUI.
     */
    save(silent = true): void {
        this.node?.updateNode({ silent });
    }

    /**
     * Removes this widget from its parent node.
     */
    removeSelf(): void {
        if (!this.comfyNode || this.#widget?.index == null) return;
        this.comfyNode.widgets.splice(this.#widget.index, 1);
        this.node?.updateNode();
    }

    // Lifecycle hooks for subclasses
    onInit(): void {}
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onSync(_value: any): void {}
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onValueChange(_path: string, _value: any): void {}
    onDestroy(): void {}
}
