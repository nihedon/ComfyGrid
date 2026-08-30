import { workflowManager } from '@/managers/workflow-manager';
import { appState } from '@/states/app-state.svelte';
import type { ComfyWindow } from '@/states/comfyui-state.svelte';
import type { ComfyApp, ComfyGraph, ComfyNode } from '@/types/comfy-model';
import logger from '@/utils/logger';

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
        app.loadGraphData = async function (...args: any[]) {
            const orgRet = await orgLoadGraphData.apply(this, args);
            appState.comfyUiState.graphReady = true;
            if (appState.uiState.activePageId === 'grid') {
                workflowManager.loadCurrentWorkflow().catch((error) => {
                    logger.error('Failed to load current workflow:', error);
                });
            } else {
                appState.uiState.needRefresh = true;
            }
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
                const ret = orgSetDirtyCanvas.apply(this, args);
                try {
                    workflowManager.handleUpdateMode();
                } catch (error) {
                    logger.error('Failed to handle set dirty canvas:', error);
                }
                return ret;
            };
        }
        anyGraph.setDirtyCanvas.__comfygrid__is_hooked__ = true;
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
