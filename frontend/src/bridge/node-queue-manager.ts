import type { ComfyApp } from '@/types/comfy-model';
import logger from '@/utils/logger';

class NodeQueueManager {
    private queueNodeIds: string[] = [];

    static #instance: NodeQueueManager;

    static getinstance(): NodeQueueManager {
        if (!this.#instance) {
            this.#instance = new NodeQueueManager();
        }
        return this.#instance;
    }

    getQueueNodeIds() {
        return this.queueNodeIds;
    }

    async queueOutputNodes(app: ComfyApp, nodeId: string) {
        try {
            this.queueNodeIds = [nodeId];
            await app.queuePrompt(0);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            logger.error(e.message, e);
        } finally {
            this.clearQueue();
        }
    }

    getNodeQueueOutput(orgOutput: Record<string, unknown>) {
        const output = {};
        for (const queueNodeId of this.queueNodeIds) {
            this.recursiveAddNodes(queueNodeId, orgOutput, output);
        }
        return output;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private recursiveAddNodes(nodeId: string, orgOutput: Record<string, any>, output: Record<string, unknown>) {
        const currentId = nodeId;
        const currentNode = orgOutput[currentId];
        if (output[currentId] == null) {
            output[currentId] = currentNode;
            for (const inputValue of Object.values(currentNode.inputs || [])) {
                if (Array.isArray(inputValue)) {
                    this.recursiveAddNodes(inputValue[0], orgOutput, output);
                }
            }
        }
        return output;
    }

    private clearQueue() {
        this.queueNodeIds = [];
    }
}

export const nodeQueueManager = NodeQueueManager.getinstance();
