import { workflowManager } from '@/managers/workflow-manager';
import { appState } from '@/states/app-state.svelte';
import type { ComfyWindow } from '@/states/comfyui-state.svelte';
import type { ComfyApp, ComfyGraph, ComfyNode } from '@/types/comfy-model';

export class ComfyUiApiHook {
    static readonly #pendingTimers = new Map<string | number, number | ReturnType<typeof setTimeout>>();

    static async #handleUpdateNodeDebounce(nodeId: string) {
        if (appState.uiState.activePageId !== 'grid') {
            return;
        }

        const existingTimer = ComfyUiApiHook.#pendingTimers.get(nodeId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timerId = setTimeout(() => {
            ComfyUiApiHook.#pendingTimers.delete(nodeId);
            workflowManager.handleUpdateNode({ nodeId });
        }, 100);

        ComfyUiApiHook.#pendingTimers.set(nodeId, timerId);
    }

    static hookLoadGraphData(app: ComfyApp) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyApp = app as any;
        if (anyApp.loadGraphData.__comfygrid__is_hooked__) {
            return;
        }
        const orgLoadGraphData = app.loadGraphData;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        app.loadGraphData = function (...args: any[]) {
            const orgRet = orgLoadGraphData.apply(this, args);
            workflowManager.handleReady();
            return orgRet;
        };
        anyApp.loadGraphData.__comfygrid__is_hooked__ = true;
    }

    static startHookLoadGraphDataInterval(window: ComfyWindow): () => void {
        const intervalId = setInterval(() => {
            const app = window?.comfyAPI?.app?.app;
            if (app?.loadGraphData) {
                ComfyUiApiHook.hookLoadGraphData(app);
                clearInterval(intervalId);
            }
        }, 10);

        return () => clearInterval(intervalId);
    }

    static hookForGraphSetDirtyCanvas(graph: ComfyGraph) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyGraph = graph as any;
        if (!anyGraph.setDirtyCanvas || anyGraph.setDirtyCanvas.__comfygrid__is_hooked__) {
            return;
        }

        const orgSetDirtyCanvas = anyGraph.setDirtyCanvas;
        if (orgSetDirtyCanvas) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            anyGraph.setDirtyCanvas = function (...args: any[]) {
                const orgRet = orgSetDirtyCanvas.apply(this, args);
                for (const node of (this as ComfyGraph).nodes) {
                    ComfyUiApiHook.#handleUpdateNodeDebounce(String(node.id));
                }
                return orgRet;
            };
        }
        anyGraph.setDirtyCanvas.__comfygrid__is_hooked__ = true;
    }

    static hookForNodeWidgetChanged(node: ComfyNode) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyNode = node as any;
        if (!anyNode.onWidgetChanged || anyNode.onWidgetChanged.__comfygrid__is_hooked__) {
            return;
        }

        const orgOnWidgetChanged = anyNode.onWidgetChanged;
        if (orgOnWidgetChanged) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            anyNode.onWidgetChanged = function (...args: any[]) {
                const orgRet = orgOnWidgetChanged.apply(this, args);
                ComfyUiApiHook.#handleUpdateNodeDebounce(String(node.id));
                return orgRet;
            };
        }
        anyNode.onWidgetChanged.__comfygrid__is_hooked__ = true;
    }

    static hookForNodeSetDirtyCanvas(node: ComfyNode) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyNode = node as any;
        if (!anyNode.setDirtyCanvas || anyNode.setDirtyCanvas.__comfygrid__is_hooked__) {
            return;
        }

        const orgSetDirtyCanvas = anyNode.setDirtyCanvas;
        if (orgSetDirtyCanvas) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            anyNode.setDirtyCanvas = function (...args: any[]) {
                const orgRet = orgSetDirtyCanvas.apply(this, args);
                ComfyUiApiHook.#handleUpdateNodeDebounce(String(node.id));
                return orgRet;
            };
        }
        anyNode.setDirtyCanvas.__comfygrid__is_hooked__ = true;
    }

    static hookForAddCustomWidget(node: ComfyNode) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyNode = node as any;
        if (!anyNode.addCustomWidget || anyNode.addCustomWidget.__comfygrid__is_hooked__) {
            return;
        }

        const orgAddCustomWidget = anyNode.addCustomWidget;
        if (orgAddCustomWidget) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            anyNode.addCustomWidget = function (...args: any[]) {
                const orgRet = orgAddCustomWidget.apply(this, args);
                ComfyUiApiHook.hookForWidgetCallback(node);
                ComfyUiApiHook.#handleUpdateNodeDebounce(String(node.id));
                return orgRet;
            };
        }
        anyNode.addCustomWidget.__comfygrid__is_hooked__ = true;
    }

    static hookForWidgetCallback(node: ComfyNode) {
        for (const widget of node.widgets ?? []) {
            if (widget.callback) {
                const orgCallback = widget.callback;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const anyWidget = widget as any;
                if (anyWidget.callback.__comfygrid__is_hooked__) {
                    continue;
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                anyWidget.callback = function (...args: any[]) {
                    const orgRet = orgCallback.apply(this, args);
                    ComfyUiApiHook.#handleUpdateNodeDebounce(String(node.id));
                    return orgRet;
                };
                anyWidget.callback.__comfygrid__is_hooked__ = true;
            }
        }
    }
}
