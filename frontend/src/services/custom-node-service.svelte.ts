/* eslint-disable @typescript-eslint/no-explicit-any */
import { mount, unmount } from 'svelte';
import ModalComboWidget from '@/components/widgets/comfyui/features/ModalComboWidget.svelte';
import { appState } from '@/states/app-state.svelte';
import type { ComfyGridNode } from '@/states/model-state.svelte';

type NodeChangeCallback = (node: unknown) => void;

// eslint-disable-next-line svelte/prefer-svelte-reactivity
const subscriptions = new Map<string, Set<NodeChangeCallback>>();

/**
 * Exposes `window.api` for use by external Custom Element extensions.
 * Must be called before mounting the Svelte app.
 */
export function setupCustomNodeApi(): void {
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
            #widget: any = null;
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
}

/** Called by NodeWidget's $effect whenever a tracked node changes. */
export function notifyNodeChanged(nodeId: string, node?: ComfyGridNode): void {
    subscriptions.get(nodeId)?.forEach((cb) => cb(node));
}
