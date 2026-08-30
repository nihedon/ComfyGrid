/* eslint-disable @typescript-eslint/no-explicit-any */
import { mount, unmount } from 'svelte';
import ModalComboWidget from '@/components/widgets/comfyui/features/ModalComboWidget.svelte';
import { ComfyGridWidget as BaseComfyGridWidget } from '@/services/comfygrid-widget';
import { appState } from '@/states/app-state.svelte';
import type { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';

type NodeChangeCallback = (node: unknown) => void;

// eslint-disable-next-line svelte/prefer-svelte-reactivity
const subscriptions = new Map<string, Set<NodeChangeCallback>>();

/**
 * Exposes `window.api` and `window.ComfyGridWidget` for use by external Custom Element extensions.
 * Must be called before mounting the Svelte app.
 */
export function setupCustomNodeApi(): void {
    (globalThis as any).ComfyGridWidget = BaseComfyGridWidget;

    if (!globalThis.api) {
        globalThis.api = {} as any;
    }
    Object.assign(globalThis.api, {
        getBridge() {
            return appState.bridge;
        },
        subscribe(nodeId: string, callback: NodeChangeCallback): () => void {
            if (!subscriptions.has(nodeId)) {
                // eslint-disable-next-line svelte/prefer-svelte-reactivity
                subscriptions.set(nodeId, new Set());
            }
            subscriptions.get(nodeId).add(callback);
            return () => subscriptions.get(nodeId)?.delete(callback);
        },
        getModels(category?: string) {
            const models = Array.from(appState.storageState.models.values());
            return category ? models.filter((m: any) => m.category === category) : models;
        },
        openModelModal(modelDir: string, subDirs: string[], onSelect: (path: string) => void) {
            appState.modalState.setup('', modelDir as any, subDirs, null, (model: any) => onSelect(model.path));
        },
        getModel(fullPath: string) {
            return appState.storageState.findModelByFullPath(fullPath) ?? null;
        },
        showModelPopover(target: HTMLElement, modelFullPath: string) {
            const model = appState.storageState.findModelByFullPath(modelFullPath);
            if (model) {
                appState.popoverState.showModelPopover(target, model, 'models');
            }
        },
        hidePopover() {
            appState.popoverState.hidePopover();
        },
        mountModalComboWidget(target: HTMLElement, props: any) {
            const stateProps = $state({ ...props });
            const comp = mount(ModalComboWidget, { target, props: stateProps });
            return {
                update(newProps: any) {
                    Object.assign(stateProps, newProps);
                },
                destroy() {
                    unmount(comp);
                },
            };
        },
    });

    if (!customElements.get('cg-modal-combo-widget')) {
        class CgModalComboWidget extends HTMLElement {
            #comp: Record<string, any> | null = null;
            #props: Record<string, any> | null = null;
            #widget: ComfyGridWidget = null;
            #isValidOverride: any = undefined;

            set widget(val: any) {
                if (this.#widget?.id === val?.id && this.#widget?.value === val?.value) {
                    this.#widget = val;
                    return;
                }
                this.#widget = val;
                if (this.#props) {
                    this.#props.widget = val;
                } else {
                    this.#mountIfReady();
                }
            }
            get widget() {
                return this.#widget;
            }

            set isValidOverride(val: any) {
                if (this.#isValidOverride === val) {
                    return;
                }
                this.#isValidOverride = val;
                if (this.#props) {
                    this.#props.isValidOverride = val;
                }
            }
            get isValidOverride() {
                return this.#isValidOverride;
            }

            connectedCallback() {
                this.#mountIfReady();
            }

            #mountIfReady() {
                if (this.#comp || !this.#widget) return;

                const modelDir = (this.getAttribute('model-dir') as any) || 'models';
                const rawSubdirs = this.getAttribute('model-subdirs');
                const modelSubdirs = rawSubdirs ? rawSubdirs.split(',').map((s) => s.trim()) : ['loras'];

                const props = $state({
                    widget: this.#widget,
                    isValidOverride: this.#isValidOverride,
                    modelDir,
                    modelSubdirs,
                    handleInput: (e: any, _w: any, model: any) => {
                        if (this.#widget) {
                            if (model) {
                                this.#widget.value = model.path;
                            } else if (e?.detail?.value !== undefined) {
                                this.#widget.value = e.detail.value;
                            }
                        }
                        this.dispatchEvent(new CustomEvent('change', { bubbles: true }));
                    },
                });
                this.#props = props;

                this.#comp = mount(ModalComboWidget, {
                    target: this,
                    props,
                });
            }

            disconnectedCallback() {
                if (this.#comp) {
                    unmount(this.#comp);
                    this.#comp = null;
                    this.#props = null;
                }
            }
        }

        customElements.define('cg-modal-combo-widget', CgModalComboWidget);
    }

    if (!customElements.get('cg-button-widget')) {
        class CgButtonWidget extends HTMLElement {
            #button: HTMLButtonElement | null = null;
            #widget: any = null;
            #label: string | null = null;
            #variant: string = 'secondary';

            set widget(val: any) {
                this.#widget = val;
                this.#update();
            }
            get widget() {
                return this.#widget;
            }

            set label(val: string | null) {
                this.#label = val;
                this.#update();
            }
            get label() {
                return this.#label;
            }

            set variant(val: string | null) {
                this.#variant = val || 'secondary';
                this.#update();
            }
            get variant() {
                return this.#variant;
            }

            connectedCallback() {
                if (!this.#button) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.addEventListener('click', () => {
                        this.dispatchEvent(new CustomEvent('click', { bubbles: true }));
                    });
                    this.#button = btn;
                    this.appendChild(btn);
                }
                this.#update();
            }

            #update() {
                if (!this.#button) return;
                const labelAttr = this.getAttribute('label');
                const variantAttr = this.getAttribute('variant') || 'secondary';
                const currentVariant = this.#variant || variantAttr;
                this.#button.className = `btn btn-sm btn-${currentVariant} w-100`;

                const labelText = this.#label ?? labelAttr ?? this.#widget?.label ?? this.#widget?.name ?? 'Button';
                this.#button.textContent = labelText;
                if (this.#widget?.tooltip) {
                    this.#button.title = this.#widget.tooltip;
                }
            }
        }

        customElements.define('cg-button-widget', CgButtonWidget);
    }

    if (!customElements.get('cg-toggle-widget')) {
        class CgToggleWidget extends HTMLElement {
            #container: HTMLDivElement | null = null;
            #labelEl: HTMLLabelElement | null = null;
            #inputEl: HTMLInputElement | null = null;
            #widget: any = null;
            #label: string | null = null;

            set widget(val: any) {
                this.#widget = val;
                this.#update();
            }
            get widget() {
                return this.#widget;
            }

            set label(val: string | null) {
                this.#label = val;
                this.#update();
            }
            get label() {
                return this.#label;
            }

            set checked(val: boolean) {
                if (this.#inputEl) {
                    this.#inputEl.checked = Boolean(val);
                }
                if (this.#widget) {
                    this.#widget.value = Boolean(val);
                    this.#widget.updateValue?.();
                    this.#widget.onDrawBackground?.();
                }
            }
            get checked(): boolean {
                return this.#inputEl ? this.#inputEl.checked : Boolean(this.#widget?.value);
            }

            set value(val: any) {
                this.checked = Boolean(val);
            }
            get value(): boolean {
                return this.checked;
            }

            connectedCallback() {
                if (!this.#container) {
                    const container = document.createElement('div');
                    container.className =
                        'form-switch form-check d-flex align-items-center justify-content-between p-0 w-100 m-0';

                    const labelEl = document.createElement('label');
                    labelEl.className = 'form-check-label text-truncate me-2 user-select-none';
                    labelEl.style.cursor = 'pointer';

                    const inputEl = document.createElement('input');
                    inputEl.type = 'checkbox';
                    inputEl.className = 'form-check-input m-0 float-none';
                    inputEl.role = 'switch';

                    const id = this.id || this.#widget?.id || `cg-toggle-${Math.random().toString(36).slice(2, 8)}`;
                    inputEl.id = id;
                    labelEl.htmlFor = id;

                    inputEl.addEventListener('change', () => {
                        if (this.#widget) {
                            this.#widget.value = inputEl.checked;
                            this.#widget.updateValue?.();
                            this.#widget.onDrawBackground?.();
                        }
                        this.dispatchEvent(
                            new CustomEvent('change', { bubbles: true, detail: { checked: inputEl.checked } }),
                        );
                    });

                    container.appendChild(labelEl);
                    container.appendChild(inputEl);
                    this.appendChild(container);

                    this.#container = container;
                    this.#labelEl = labelEl;
                    this.#inputEl = inputEl;
                }
                this.#update();
            }

            #update() {
                if (!this.#inputEl || !this.#labelEl) return;
                const labelAttr = this.getAttribute('label');
                const labelText = this.#label ?? labelAttr ?? this.#widget?.label ?? this.#widget?.name ?? '';
                this.#labelEl.textContent = labelText;
                this.#labelEl.style.display = labelText ? '' : 'none';

                if (this.#widget?.value !== undefined) {
                    this.#inputEl.checked = Boolean(this.#widget.value);
                }

                if (this.#widget?.tooltip) {
                    this.title = this.#widget.tooltip;
                }
            }
        }

        customElements.define('cg-toggle-widget', CgToggleWidget);
    }
}

/** Called by NodeWidget's $effect whenever a tracked node changes. */
export function notifyNodeChanged(nodeId: string, node?: ComfyGridNode): void {
    subscriptions.get(nodeId)?.forEach((cb) => cb(node));
}
