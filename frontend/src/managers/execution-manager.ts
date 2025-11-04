import { appState } from '@/states/app-state.svelte';
import { type DialogType } from '@/states/dialog-state.svelte';
import logger from '@/utils/logger';
import { gallerySession } from './gallery-session-manager';
import { jobManager } from './job-manager';

/**
 * Maps ComfyGrid WebSocket execution events to UI state (`executionState`, workspace errors, dialogs)
 * and delegates gallery/job persistence to {@link JobManager}.
 *
 * **When `executionState` progress is reset (`onTaskFinished`):** the server reports an empty queue
 * (`onStatus`), or the last tracked job completes while the queue is empty (`onExecutionCompleted`),
 * or a new prompt is queued after no jobs were active (`onPromptQueued` via
 * {@link GallerySession.beginQueuedPrompt}). These paths clear {@link GallerySession} tracking,
 * wipe progress UI, and clear `lastProcessedJobId`.
 */
class ExecutionManager {
    handleSamplingInfo(metadata: { jobId: string; [key: string]: string }) {
        const { jobId, ...meta } = metadata;
        jobManager.appendJobMetadata(jobId, meta);
    }

    handlePromptQueued(payload: { jobId: string; nodeIds: string[]; prompt?: string; workflow?: string }) {
        const { jobId, nodeIds, prompt, workflow } = payload;

        if (gallerySession.beginQueuedPrompt()) {
            logger.debug('All jobs finished — clearing gallery for new batch');
            jobManager.cleanupViewedJobs();
        }
        gallerySession.trackQueued(jobId);

        jobManager.registerQueuedJob(jobId, {
            ckpt_name: this.getModelName(nodeIds),
            prompt: prompt,
            workflow: workflow,
        });

        appState.executionState.progress.status = 'processing';
        appState.executionState.progress.setNodeSet(jobId, nodeIds);
    }

    handleStatus(payload: { queueRemaining: number }) {
        const queueCount = payload.queueRemaining;
        appState.executionState.queueCount = queueCount;
        if (!appState.executionState.lastProcessedJobId) {
            appState.executionState.progress.status = 'busy';
        }
        if (queueCount === 0) {
            if (appState.executionState.lastProcessedJobId) {
                this.handleTaskFinished();
                this.notifyTaskFinished();
            }
        }
    }

    handleProgressState(payload: { jobId: string }) {
        appState.executionState.lastProcessedJobId = payload.jobId;
    }

    handleExecutionStart(payload: { jobId: string }) {
        const jobId = payload.jobId || appState.executionState.lastProcessedJobId;
        appState.executionState.lastProcessedJobId = jobId;

        jobManager.clearOtherPreviews(jobId);

        appState.executionState.progress.value = 0;
        appState.executionState.progress.status = 'processing';
        appState.workspaceState.clearErrorWidgets();
    }

    handleExecutionSuccess(payload: { jobId: string }) {
        const jobId = payload.jobId || appState.executionState.lastProcessedJobId;

        gallerySession.trackFinished(jobId);
        jobManager.markJobCompleted(jobId);

        appState.executionState.progress.toExecuted(jobId);

        if (gallerySession.activeCount === 0 && appState.executionState.queueCount === 0) {
            if (appState.executionState.lastProcessedJobId) {
                this.notifyTaskFinished();
                this.handleTaskFinished();
            }
        }
    }

    handleExecutionError(payload: {
        jobId: string;
        nodeId: string;
        exceptionType: DialogType;
        nodeType: string;
        exceptionMessage: string;
        traceback: string[];
    }) {
        const { jobId: _jobId, nodeId, exceptionType, nodeType, exceptionMessage, traceback } = payload;

        const jobId = _jobId ?? appState.executionState.lastProcessedJobId;
        gallerySession.trackFinished(jobId);
        jobManager.removeJob(jobId);

        appState.executionState.progress.status = 'error';

        appState.workspaceState.addErrorWidget(nodeId, '');

        const type = exceptionType || 'TypeError';
        const title = nodeType || 'Execution failed';
        const message = exceptionMessage || 'Execution failed';
        appState.dialogState.showDialog({ type, title, message, traceback: traceback || [] });
    }

    handleExecutionInterrupted(payload: { jobId: string }) {
        const jobId = payload.jobId || appState.executionState.lastProcessedJobId;

        gallerySession.trackFinished(jobId);
        jobManager.removeJob(jobId);

        appState.executionState.progress.status = 'interrupted';
    }

    handleExecuting(payload: { jobId: string; nodeIds: string[]; nodeNames: Record<string, string> }) {
        const { jobId, nodeIds, nodeNames } = payload;
        appState.executionState.lastProcessedJobId = jobId;

        if (appState.executionState.executingNodeId) {
            appState.executionState.progress.addExecutedNodeSet(jobId, [appState.executionState.executingNodeId]);
        }
        const lastNodeId = nodeIds.pop();
        appState.executionState.executingNodeId = lastNodeId;
        appState.executionState.progress.label = nodeNames[appState.executionState.labelNodeId] ?? '';
        appState.executionState.progress.value = 0;
        appState.executionState.progress.maxValue = 0;
        appState.executionState.progress.addExecutedNodeSet(jobId, nodeIds);
    }

    handleExecuted(payload: { jobId: string; nodeIds: string[]; nodeNames: Record<string, string>; cached: boolean }) {
        const { jobId, nodeNames, cached } = payload;
        let nodeIds = payload.nodeIds;

        appState.executionState.lastProcessedJobId = jobId;

        if (!cached) {
            const nodeId = nodeIds[0];
            if (nodeId.includes('.')) {
                nodeIds = [nodeId.split('.').at(-1)];
                if (appState.executionState.progress.executedNodeSet.get(jobId)?.has(nodeIds[0])) {
                    const executedNodes = [...appState.executionState.progress.executedNodeSet.get(jobId)];
                    const trimmedExecutedNodes = executedNodes.slice(0, executedNodes.indexOf(nodeIds[0]));
                    appState.executionState.progress.setExecutedNodeSet(jobId, trimmedExecutedNodes);
                }
            }
        }

        if (appState.executionState.executingNodeId) {
            appState.executionState.progress.addExecutedNodeSet(jobId, [appState.executionState.executingNodeId]);
        }
        const lastNodeId = nodeIds.at(-1);
        appState.executionState.executingNodeId = null;
        appState.executionState.progress.label = nodeNames[lastNodeId?.split(':')?.at(-1)] ?? '';
        appState.executionState.progress.value = 0;
        appState.executionState.progress.maxValue = 0;
        appState.executionState.progress.addExecutedNodeSet(jobId, nodeIds);
    }

    handleProgress(payload: { value: number; max: number }) {
        const { value, max } = payload;
        appState.executionState.progress.value = value;
        appState.executionState.progress.maxValue = max;
    }

    async handleUpdatePreview(payload: { blob: Blob }) {
        const { blob } = payload;
        await jobManager.onPreviewUpdated(blob);
    }

    async handleImageGenerated(payload: { jobId: string; nodeId: string; images: string[][] }) {
        const { jobId, nodeId, images } = payload;

        const lastBatchJobId = await jobManager.onImageGenerated(jobId, nodeId, images);
        if (lastBatchJobId) {
            appState.executionState.lastProcessedJobId = lastBatchJobId;
        }
    }

    private getModelName(nodeIds: string[]): string | null {
        const nodes = appState.workspaceState.getAllNodes(nodeIds);
        for (const node of nodes) {
            for (const widget of node.widgets) {
                if (widget.name == 'ckpt_name' || widget.name == 'unet_name') {
                    let modelName = widget.value;
                    modelName = modelName.split('/').pop() ?? modelName;
                    return modelName;
                }
            }
        }
        return null;
    }

    private handleTaskFinished() {
        gallerySession.clearTrackedJobs();

        appState.executionState.progress.clear();

        appState.executionState.executingNodeId = null;
        appState.executionState.lastProcessedJobId = '';
    }

    private notifyTaskFinished() {
        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                const notif: { body: string; icon?: string } = {
                    body: 'Generation completed',
                };
                const thumbnail = jobManager.getLastThumbnail();
                if (thumbnail) {
                    notif.icon = thumbnail;
                }
                new Notification('ComfyGrid', notif);
            }
        });
    }
}

export const executionManager = new ExecutionManager();
