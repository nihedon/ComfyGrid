import { ComfyUiApiHook } from '@/bridge/comfyui-api-hook';
import { nodeQueueManager } from '@/bridge/node-queue-manager';
import type { ComfyGraph } from '@/types/comfy-model';
import logger from '@/utils/logger';
import { appState } from './app-state.svelte';
import { ComfyGridNode } from './model-state.svelte';

/**
 *
 * @param graph
 */
async function waitOnDrawBackgroundAll(graph: ComfyGraph) {
    for (const node of graph.nodes) {
        try {
            node.onDrawBackground?.();
        } catch (error) {
            logger.debug('Error in onDrawBackground for node', node, error);
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
        nodes: ComfyGridNode[];
    }> {
        const app = appState.comfyUiState.app;
        const nodes: ComfyGridNode[] = [];

        await waitOnDrawBackgroundAll(app.rootGraph);

        for (const topNode of app.rootGraph.nodes) {
            ComfyUiApiHook.hookForAddCustomWidget(topNode);
            ComfyUiApiHook.hookForNodeWidgetChanged(topNode);
            ComfyUiApiHook.hookForWidgetCallback(topNode);
            ComfyUiApiHook.hookForNodeSetDirtyCanvas(topNode);
        }

        for (const comfyNode of app.rootGraph.nodes) {
            const node = new ComfyGridNode(comfyNode, app);
            nodes.push(node);
            for (const subNode of ComfyGridNode.subgraphNodes(app, node)) {
                nodes.push(subNode);
            }
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
        this.#app.queuePrompt(0, batchCount);
    }

    async nodeQueue(payload: { nodeId: string }): Promise<void> {
        const { nodeId } = payload;
        await nodeQueueManager.queueOutputNodes(this.#app, nodeId);
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
