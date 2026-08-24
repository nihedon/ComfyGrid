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

        const workflowLabel = document.querySelector('.workflow-tabs > .p-togglebutton-checked .workflow-label');
        const title = workflowLabel?.textContent?.trim() || 'Untitled';

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
