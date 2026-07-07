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
        getModel(path: string) {
            return appState.storageState.findModelByPath(path) ?? null;
        },
        showModelPopover(target: HTMLElement, modelPath: string) {
            const model = appState.storageState.findModelByPath(modelPath);
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
}

/** Called by NodeWidget's $effect whenever a tracked node changes. */
export function notifyNodeChanged(nodeId: string, node?: ComfyGridNode): void {
    subscriptions.get(nodeId)?.forEach((cb) => cb(node));
}
