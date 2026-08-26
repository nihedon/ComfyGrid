import { ComfyUiApiHook } from '@/bridge/comfyui-api-hook';
import { nodeQueueManager } from '@/bridge/node-queue-manager';
import { translationManager } from '@/services/translation-service.svelte';
import type { ComfyGraph, ComfyNode } from '@/types/comfy-model';
import logger from '@/utils/logger';
import { appState } from './app-state.svelte';

/**
 *
 * @param graph
 */
async function waitOnDrawBackgroundAll(graph: ComfyGraph) {
    for (const node of graph.nodes) {
        try {
            node.onDrawBackground?.();
        } catch (error) {
            logger.error('Error in onDrawBackground for node', node, error);
        }
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
}

export type WorkflowTabItem = {
    label: string;
    tab: HTMLButtonElement;
    selected: boolean;
};

export class ComfyUiBridge {
    static #instance: ComfyUiBridge;

    readonly #app = $derived(appState.comfyUiState.app);

    static getInstance() {
        if (!this.#instance) {
            this.#instance = new this();
        }
        return this.#instance;
    }

    private constructor() {}

    /**
     * Get list of all workflow tab items in ComfyUI.
     */
    getWorkflowTabs(): WorkflowTabItem[] {
        const doc = appState.comfyUiState.window?.document || appState.comfyUiState.iframe?.contentDocument || document;
        const buttons = doc.querySelectorAll<HTMLButtonElement>('.workflow-tabs > button');
        const items: WorkflowTabItem[] = [];

        buttons.forEach((btn) => {
            const labelEl = btn.querySelector('.workflow-label');
            const label = labelEl?.textContent?.trim() || 'Untitled';
            const selected = btn.classList.contains('p-togglebutton-checked');
            items.push({ label, tab: btn, selected });
        });

        return items;
    }

    async getWorkflow(): Promise<{
        graphId: string;
        name: string;
        nodes: ComfyNode[];
    }> {
        const app = appState.comfyUiState.app;
        const nodes: ComfyNode[] = app.rootGraph.nodes;

        await waitOnDrawBackgroundAll(app.rootGraph);

        for (const topNode of app.rootGraph.nodes) {
            ComfyUiApiHook.hookForAddCustomWidget(topNode);
            ComfyUiApiHook.hookForNodeWidgetChanged(topNode);
            ComfyUiApiHook.hookForWidgetCallback(topNode);
            ComfyUiApiHook.hookForNodeSetDirtyCanvas(topNode);
        }

        const tabs = this.getWorkflowTabs();
        const activeTab = tabs.find((t) => t.selected);
        const title = activeTab?.label || 'Untitled';

        return {
            graphId: app.rootGraph.id,
            name: title,
            nodes,
        };
    }

    /**
     * Handle queue prompt command from ComfyGrid
     * @param batchCount - Number of batches to queue
     */
    async queuePrompt(batchCount: number): Promise<void> {
        const isWaiting = translationManager.isTranslating || translationManager.hasPendingTasks;
        if (isWaiting) {
            translationManager.incrementPendingQueue(batchCount);
        }
        try {
            await translationManager.waitForAllTranslations();
            this.#app.queuePrompt(0, batchCount);
        } finally {
            if (isWaiting) {
                translationManager.decrementPendingQueue(batchCount);
            }
        }
    }

    async nodeQueue(payload: { nodeId: string }): Promise<void> {
        const isWaiting = translationManager.isTranslating || translationManager.hasPendingTasks;
        if (isWaiting) {
            translationManager.incrementPendingQueue(1);
        }
        try {
            await translationManager.waitForAllTranslations();
            const { nodeId } = payload;
            await nodeQueueManager.queueOutputNodes(this.#app, nodeId);
        } finally {
            if (isWaiting) {
                translationManager.decrementPendingQueue(1);
            }
        }
    }

    /**
     * Handle load workflow command from ComfyGrid
     * @param e - Message event containing workflow JSON string
     * @param payload
     * @param payload.filename
     * @param payload.json
     */
    async loadWorkflow(payload: { filename: string; json: unknown }): Promise<{ success: boolean; error?: string }> {
        const { filename, json } = payload;
        try {
            await this.#app.loadGraphData(json, true, true, filename, {
                showMissingNodesDialog: true,
                showMissingModelsDialog: true,
            });
            return { success: true };
        } catch (error) {
            logger.error('Failed to load workflow', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
