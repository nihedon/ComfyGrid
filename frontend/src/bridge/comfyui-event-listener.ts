/**
 * ComfyGrid extension entry point
 * Registers the postMessage bridge between ComfyUI and ComfyGrid
 */
import { executionManager } from '@/managers/execution-manager';
import { workflowManager } from '@/managers/workflow-manager';
import { appState } from '@/states/app-state.svelte';
import type {
    BPreviewPayload,
    ExecutedCachedPayload,
    ExecutedPayload,
    ExecutingPayload,
    ExecutionErrorPayload,
    ExecutionStartPayload,
    NotificationPayload,
    ProgressPayload,
    ProgressStatePayload,
    StatusPayload,
} from '@/types/comfy-event-payload';
import type { ComfyApi, ComfyApp, ComfyGraph, ComfyNode } from '@/types/comfy-model';
import type { ImageInfo, PromptData, QueuePromptResponse } from '@/types/model-shared';
import logger from '@/utils/logger';
import { nodeQueueManager } from './node-queue-manager';

type QueuePromptError = {
    response?: {
        node_errors: Record<string, { class_type: string; errors: { message: string; details: string }[] }>;
        error: {
            message: string;
        };
    };
    message: string;
};

export class ComfyUiEventListener {
    #currentJobId: string | null = null;

    static #instance: ComfyUiEventListener;

    static listen(api: ComfyApi) {
        if (!this.#instance) {
            this.#instance = new this(api);
        }
    }

    private constructor(api: ComfyApi) {
        this.#addEventListeners(api);
    }

    #addEventListeners(api: ComfyApi) {
        api.addEventListener('comfygrid.sampling_info', (data: CustomEvent<{ job_id: string; [key: string]: string }>) => {
            const { job_id: jobId, ...metadata } = data.detail;
            executionManager.handleSamplingInfo({ jobId, ...metadata });
        });

        api.addEventListener('comfygrid.update_preview', async (data: CustomEvent<{ job_id: string; node_id: string; timestamp: number }>) => {
            const { job_id: jobId, node_id: nodeId, timestamp } = data.detail;
            if (appState.executionState.queueJobIds.get(jobId) === 'external') {
                const res = await api.fetchApi(`/comfygrid/preview?t=${timestamp}`);
                if (res.ok) {
                    const blob = await res.blob();
                    executionManager.handleUpdatePreview({ blob, jobId, nodeId });
                }
            }
        });

        api.addEventListener('comfygrid.image_generated', (data: CustomEvent<{ job_id: string; node_id: string; images: string[][] }>) => {
            const { job_id: jobId, node_id: nodeId, images: rootPathes } = data.detail;
            if (appState.executionState.queueJobIds.get(jobId) === 'external') {
                const url = globalThis.location.origin;
                const images = rootPathes.map((o) => o.map((o2) => url + o2));
                executionManager.handleImageGenerated({ jobId, nodeId, images });
            }
        });

        api.addEventListener('execution_start', (e: CustomEvent<ExecutionStartPayload>) => {
            this.#currentJobId = e.detail.prompt_id || null;
            executionManager.handleExecutionStart({ jobId: this.#currentJobId });
        });

        api.addEventListener('execution_success', (e: CustomEvent<{ prompt_id?: string }>) => {
            const jobId = e.detail?.prompt_id || this.#currentJobId || appState.executionState.processingJobId;
            executionManager.handleExecutionSuccess({ jobId });
        });

        api.addEventListener('execution_error', (e: CustomEvent<ExecutionErrorPayload>) => {
            const { node_id: nodeId, exception_type: exceptionType, node_type: nodeType, exception_message: exceptionMessage, traceback } = e.detail;
            executionManager.handleExecutionError({ jobId: this.#currentJobId, nodeId, exceptionType, nodeType, exceptionMessage, traceback });
        });

        api.addEventListener('execution_interrupted', () => {
            executionManager.handleExecutionInterrupted({ jobId: this.#currentJobId });
        });

        api.addEventListener('executing', (e: CustomEvent<ExecutingPayload>) => {
            const nodeId = e.detail;
            if (!nodeId) {
                return;
            }
            const app = appState.comfyUiState.app;
            const nodeNames: Record<string, string> = {};
            for (const node of getNodesById(app, nodeId)) {
                nodeNames[node.id] = node.title;
            }

            const jobId = this.#currentJobId || appState.executionState.processingJobId;
            executionManager.handleExecuting({ jobId, nodeIds: [nodeId], nodeNames });
        });

        api.addEventListener('executed', (e: CustomEvent<ExecutedPayload>) => {
            if (!e.detail.display_node) {
                return;
            }
            const fileKeys = ['filename', 'subfolder', 'type'];
            const isDictionary = (val: unknown) => val !== null && typeof val === 'object' && !Array.isArray(val);

            const app = appState.comfyUiState.app;
            const nodeNames: Record<string, string> = {};
            for (const node of getNodesById(app, e.detail.display_node)) {
                nodeNames[node.id] = node.title;
            }

            const outputs = Object.values(e.detail.output ?? {}).filter(
                (o) => Array.isArray(o) && o.some((o2) => isDictionary(o2) && fileKeys.every((k: string) => k in o2)),
            ) as ImageInfo[][];
            const relPathes = outputs ? outputs[0]?.map((_, i) => outputs.map((row) => row[i])) : undefined;

            // Image generation notification for image comparison widgets
            if (relPathes?.length) {
                const topNode = getMainGraphNode(app, e.detail.display_node);
                const url = globalThis.location.origin + '/api/view?';

                const images = relPathes.map((o) => o.map((o2) => url + new URLSearchParams(o2).toString()));
                executionManager.handleImageGenerated({
                    jobId: e.detail.prompt_id,
                    nodeId: e.detail.display_node,
                    images,
                });

                topNode.onDrawBackground?.();
            }

            executionManager.handleExecuted({ jobId: e.detail.prompt_id, nodeIds: [e.detail.display_node], nodeNames, cached: false });
        });

        api.addEventListener('execution_cached', (e: CustomEvent<ExecutedCachedPayload>) => {
            const app = appState.comfyUiState.app;
            const nodeNames: Record<string, string> = {};
            for (const nodeId of e.detail.nodes) {
                for (const node of getNodesById(app, nodeId)) {
                    nodeNames[node.id] = node.title;
                }
            }
            executionManager.handleExecuted({ jobId: e.detail.prompt_id, nodeIds: e.detail.nodes, nodeNames, cached: true });
        });

        api.addEventListener('progress', (e: CustomEvent<ProgressPayload>) => {
            executionManager.handleProgress({ value: e.detail.value, max: e.detail.max });
        });

        api.addEventListener('status', (e: CustomEvent<StatusPayload>) => {
            const queueRemaining = e.detail?.exec_info?.queue_remaining;
            executionManager.handleStatus({ queueRemaining });
        });

        api.addEventListener('progress_state', (e: CustomEvent<ProgressStatePayload>) => {
            executionManager.handleProgressState({ jobId: e.detail.prompt_id });
        });

        api.addEventListener('b_preview', (e: CustomEvent<BPreviewPayload>) => {
            executionManager.handleUpdatePreview({ blob: e.detail });
        });

        api.addEventListener('notification', (e: CustomEvent<NotificationPayload>) => {
            appState.toastState.addToast({ type: 'info', message: e.detail });
        });

        api.socket.addEventListener('open', () => {
            appState.toastState.addToast({ type: 'success', message: 'ComfyUI connection opened' });
        });

        api.socket.addEventListener('error', () => {
            appState.dialogState.showErrorDialog({ title: 'Error', message: 'ComfyUI connection error' });
        });

        api.socket.addEventListener('close', () => {
            appState.dialogState.showFatalDialog({ title: 'Closed', message: 'ComfyUI connection closed' });
        });

        this.#hookQueuePrompt(api);
    }

    /**
     * Hook into queue prompt to monitor execution and update widgets
     * @param api
     */
    #hookQueuePrompt(api: ComfyApi) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyQueuePrompt = api.queuePrompt as any;
        if (anyQueuePrompt.__comfygrid__is_hooked__) {
            return;
        }

        const orgQueuePrompt = api.queuePrompt;
        api.queuePrompt = async (index: number, prompt: PromptData, ...args: unknown[]): Promise<QueuePromptResponse> => {
            let response!: QueuePromptResponse;
            const needUpdateNodes: ComfyNode[] = [];

            try {
                response = await orgQueuePrompt.apply(api, [index, prompt, ...args]);
                try {
                    this.#handlePromptQueued(response.prompt_id, prompt);
                    if (nodeQueueManager.getQueueNodeIds().length && prompt.output) {
                        prompt.output = nodeQueueManager.getNodeQueueOutput(prompt.output);
                    }
                    const app = appState.comfyUiState.app;
                    Object.keys(prompt.output).forEach((id) => {
                        const nodes = getNodesById(app, id);
                        if (nodes.length > 0 && needNodeUpdate(nodes[0])) {
                            needUpdateNodes.push(getMainGraphNode(app, nodes[0].id));
                        }
                    });
                    if (needUpdateNodes.length > 0) {
                        const uniqueTopNodes = [...new Map(needUpdateNodes.map((n) => [n.id, n])).values()];
                        for (const node of uniqueTopNodes) {
                            workflowManager.handleUpdateNode({ nodeId: String(node.id) });
                        }
                    }
                } catch (err) {
                    const error = err as Error;
                    appState.toastState.addToast({ type: 'error', message: error.message });
                    logger.error(error.message, error);
                    throw error;
                }
            } catch (err) {
                const error = err as QueuePromptError;
                const nodeErrors = error.response?.node_errors ?? {};
                const traceback = [];
                for (const nodeError of Object.values(nodeErrors)) {
                    const errors = nodeError.errors;
                    traceback.push(
                        `${nodeError.class_type}\n${errors.map((e) => {
                            return `  ${e.message}\n    ${e.details}`;
                        })}`,
                    );
                }
                appState.workspaceState.clearErrorWidgets();
                for (const nodeId of Object.keys(nodeErrors)) {
                    appState.workspaceState.addErrorWidget(nodeId, '');
                }

                appState.dialogState.showErrorDialog({
                    title: error.message,
                    message: error?.response?.error?.message,
                    traceback,
                });

                logger.error(error.message, error);
                throw error;
            }

            return response;
        };
        anyQueuePrompt.__comfygrid__is_hooked__ = true;
    }

    /**
     * Set the prompt data for tracking execution
     * @param jobId - Job ID
     * @param prompt - Prompt data
     */
    #handlePromptQueued(jobId: string, prompt: PromptData): void {
        executionManager.handlePromptQueued({
            jobId: jobId,
            nodeIds: Object.keys(prompt.output).map((nodeId) => nodeId),
            prompt: JSON.stringify(prompt),
            workflow: JSON.stringify(prompt.workflow ?? {}),
        });
    }
}

/**
 * Get the top-level node that contains the given node ID.
 * If the node is not in a subgraph, return the node itself.
 * @param app
 * @param nodeId
 */
function getMainGraphNode(app: ComfyApp, nodeId: number | string): ComfyNode {
    const directNode = app.rootGraph.getNodeById(nodeId);
    if (directNode) return directNode;

    const contains = (graph: ComfyGraph, nodeId: number | string): boolean => {
        if (graph.getNodeById(nodeId)) return true;
        return graph.nodes.some((n) => n.isSubgraphNode && n.subgraph && contains(n.subgraph, nodeId));
    };

    return app.rootGraph.nodes.find((n) => n.isSubgraphNode && n.subgraph && contains(n.subgraph, nodeId));
}

/**
 * Get node(s) by ID, handling subgraph paths
 * @param app
 * @param nodeId - Node ID string or number
 * @returns Array of [targetNode, subgraphNode?]
 */
function getNodesById(app: ComfyApp, nodeId: string): ComfyNode[] {
    const ids = nodeId.split(':');
    if (ids.length === 1) {
        const node = app.rootGraph.getNodeById(nodeId);
        return node ? [node] : [];
    }

    let parent = app.rootGraph;
    let targetNode: ComfyNode;
    let subgraphNode: ComfyNode;
    while (ids.length > 0) {
        const id = ids.shift();
        const node = parent.getNodeById(Number(id));
        subgraphNode ??= node;
        if (ids.length > 0) {
            parent = node.subgraph;
        } else {
            targetNode = node;
        }
    }

    return [targetNode, subgraphNode];
}

/**
 * Check if the node needs to be updated
 * @param node
 */
function needNodeUpdate(node: ComfyNode) {
    const hasAfterGenerateWidget = node.widgets?.some((w) => w.name === 'control_after_generate' && w.value !== 'fixed');
    if (hasAfterGenerateWidget) {
        return true;
    }
    const hasSeedWidget = node.widgets?.some((w) => {
        if (w.type !== 'combo') {
            return false;
        }
        const val = String(w.value ?? '');
        if (val.startsWith('randomize') || val.startsWith('increment') || val.startsWith('decrement')) {
            return true;
        }
        return false;
    });
    if (hasSeedWidget) {
        return true;
    }
    const hasReadonlyText = node.widgets?.some((w) => w.inputEl?.readOnly);
    if (hasReadonlyText) {
        return true;
    }
    return false;
}
