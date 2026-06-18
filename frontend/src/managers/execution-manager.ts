import { comfyGridApiClient, comfyUiApiClient } from '@/api/api-client';
import { appState } from '@/states/app-state.svelte';
import { type DialogType } from '@/states/dialog-state.svelte';
import type { JobInfo } from '@/states/job-state.svelte';
import type { ImageInfo } from '@/types/model-shared';
import logger from '@/utils/logger';
import { gallerySession } from './gallery-session-manager';
import { mediaProcessor } from './media-processor';

/**
 * Maps ComfyGrid WebSocket execution events to UI state and orchestrates the job lifecycle.
 *
 * **Job lifecycle methods** (`#registerJob`, `#completeJob`, `#removeJob`) directly manage
 * both {@link JobState} (in-progress tracking) and {@link GalleryState} (display state).
 *
 * **When `executionState` progress is reset (`handleTaskFinished`):** the server reports an empty
 * queue (`handleStatus`), or the last tracked job completes while the queue is empty
 * (`handleExecutionSuccess`), or a new prompt is queued after no jobs were active
 * (`handlePromptQueued` via {@link GallerySession.beginQueuedPrompt}).
 */

class ExecutionManager {
    handleSamplingInfo(payload: { jobId: string; [key: string]: string }) {
        const { jobId, ...metadata } = payload;
        const jobInfo = appState.jobState.jobs.get(jobId);
        if (!jobInfo) return;
        jobInfo.metadata = { ...jobInfo.metadata, ...metadata };
        appState.galleryState.upsertJob(jobId, { metadata: { ...jobInfo.metadata } });
    }

    handlePromptQueued(payload: {
        jobId: string;
        nodeIds: string[];
        prompt?: string;
        workflow?: string;
        owner?: 'owned' | 'external';
        ckpt_name?: string | null;
    }) {
        const { nodeIds, prompt, workflow, owner = 'owned' } = payload;
        const jobId = payload.jobId;
        const ckpt_name = payload.ckpt_name ?? this.getModelName(nodeIds);

        if (owner === 'owned') {
            comfyGridApiClient.postJobs(jobId, nodeIds, prompt, workflow, ckpt_name);
        }

        appState.executionState.addQueueJobId(jobId, owner);

        if (gallerySession.beginQueuedPrompt()) {
            logger.debug('All jobs finished — clearing gallery for new batch');
            appState.galleryState.clearViewedJobs();
        }
        gallerySession.trackQueued(jobId);

        this.#registerJob(jobId, { ckpt_name, prompt, workflow, owner });

        appState.executionState.progress.status = 'processing';
        appState.executionState.progress.setNodeSet(jobId, nodeIds);
    }

    #lastQueueRemaining: number = -1;
    #isRestoring = false;

    handleStatus(payload: { queueRemaining: number }) {
        const queueRemaining = payload.queueRemaining;
        const queueJobIds = appState.executionState.queueJobIds;
        const jobId = appState.executionState.processingJobId;

        if (this.#lastQueueRemaining !== -1 && queueRemaining < this.#lastQueueRemaining) {
            const owner = queueJobIds.get(jobId);
            if (owner === 'external' && jobId) {
                this.handleExecutionSuccess({ jobId });
            }
        }
        this.#lastQueueRemaining = queueRemaining;

        if (queueRemaining === 0) {
            if (jobId) {
                this.handleTaskFinished();
                this.notifyTaskFinished();
            }
        }
    }

    handleProgressState(payload: { jobId: string }) {
        appState.executionState.setProcessingJobId(payload.jobId);
    }

    handleExecutionStart(payload: { jobId: string }) {
        const jobId = payload.jobId;

        appState.executionState.setProcessingJobId(jobId);
        mediaProcessor.clearOtherPreviews(jobId);
        appState.executionState.progress.value = 0;
        appState.executionState.progress.status = 'processing';
        appState.workspaceState.clearErrorWidgets();
    }

    handleExecutionSuccess(payload: { jobId: string }) {
        const jobId = payload.jobId;

        appState.executionState.deleteQueueJobId(jobId);
        gallerySession.trackFinished(jobId);
        this.#completeJob(jobId);
        appState.executionState.progress.toExecuted(jobId);

        if (!this.#isRestoring) {
            if (gallerySession.activeCount === 0 && appState.executionState.queueJobIds.size === 0) {
                if (appState.executionState.processingJobId) {
                    this.notifyTaskFinished();
                    this.handleTaskFinished();
                }
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
        const { jobId, nodeId, exceptionType, nodeType, exceptionMessage, traceback } = payload;

        appState.executionState.deleteQueueJobId(jobId);
        gallerySession.trackFinished(jobId);
        this.#removeJob(jobId);

        appState.executionState.progress.status = 'error';
        appState.workspaceState.addErrorWidget(nodeId, '');

        const type = exceptionType || 'TypeError';
        const title = nodeType || 'Execution failed';
        const message = exceptionMessage || 'Execution failed';
        appState.dialogState.showDialog({ type, title, message, traceback: traceback || [] });
    }

    handleExecutionInterrupted(payload: { jobId: string }) {
        const jobId = payload.jobId;

        appState.executionState.deleteQueueJobId(jobId);
        gallerySession.trackFinished(jobId);
        this.#removeJob(jobId);
        appState.executionState.progress.status = 'interrupted';
    }

    handleExecuting(payload: { jobId: string; nodeIds: string[]; nodeNames: Record<string, string> }) {
        const { jobId, nodeIds, nodeNames } = payload;

        appState.executionState.setProcessingJobId(jobId);

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

        appState.executionState.setProcessingJobId(jobId);

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
        appState.executionState.progress.value = payload.value;
        appState.executionState.progress.maxValue = payload.max;
    }

    async handleUpdatePreview(payload: { blob: Blob; jobId?: string; nodeId?: string }) {
        await mediaProcessor.onPreviewUpdated(payload);
    }

    async handleImageGenerated(payload: { jobId: string; nodeId: string; images: string[][] }) {
        const { jobId, nodeId, images } = payload;
        const lastBatchJobId = await mediaProcessor.onImageGenerated(jobId, nodeId, images);
        if (lastBatchJobId) {
            appState.executionState.setProcessingJobId(lastBatchJobId);
        }
    }

    getModelName(nodeIds: string[]): string | null {
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

    handleTaskFinished() {
        gallerySession.clearTrackedJobs();
        appState.executionState.progress.clear();
        appState.executionState.executingNodeId = null;
        appState.executionState.setProcessingJobId('');
    }

    private notifyTimeout: number | null = null;

    private notifyTaskFinished() {
        if (this.notifyTimeout !== null) {
            globalThis.clearTimeout(this.notifyTimeout);
        }

        this.notifyTimeout = globalThis.setTimeout(() => {
            Notification.requestPermission().then((permission) => {
                if (permission === 'granted') {
                    const notif: { body: string; icon?: string } = { body: 'Generation completed' };
                    const thumbnail = mediaProcessor.getLastThumbnail();
                    if (thumbnail) notif.icon = thumbnail;
                    new Notification('ComfyGrid', notif);
                }
            });
            this.notifyTimeout = null;
        }, 500);
    }

    // -----------------------------------------------------------------------
    // Job lifecycle – directly manages JobState and GalleryState
    // -----------------------------------------------------------------------

    #registerJob(jobId: string, meta: JobInfo['metadata']): void {
        const createdAt = Date.now();
        appState.jobState.setJob(jobId, { jobId, images: {}, createdAt, metadata: meta });
        appState.galleryState.upsertJob(jobId, { metadata: meta, createdAt });
    }

    #completeJob(jobId: string): void {
        const relatedIds = [...appState.jobState.jobs.keys()].filter((id) => id === jobId || id.startsWith(`${jobId}-`));
        for (const id of relatedIds) {
            const jobInfo = appState.jobState.jobs.get(id);
            if (!jobInfo) continue;
            const duration = Date.now() - jobInfo.createdAt;
            appState.galleryState.markCompleted(id, duration);
            appState.jobState.deleteJob(id);
            logger.log(`Job ${id} completed in ${(duration / 1000).toFixed(2)}s`);
        }
    }

    #removeJob(jobId: string): void {
        const relatedIds = [...appState.jobState.jobs.keys()].filter((id) => id === jobId || id.startsWith(`${jobId}-`));
        relatedIds.forEach((id) => {
            appState.jobState.deleteJob(id);
            appState.galleryState.deleteJob(id);
        });
        appState.galleryState.deleteJob(jobId);
    }

    // -----------------------------------------------------------------------
    // Reload restoration
    // -----------------------------------------------------------------------

    async syncStateFromComfyUi() {
        this.#isRestoring = true;
        try {
            await this.#appendQueueFromComfyUi();
            await this.#restoreFromHistory();
            this.#cleanupOrphanedIncompleteJobs();
        } finally {
            this.#isRestoring = false;
        }

        if (appState.executionState.queueJobIds.size === 0) {
            this.handleTaskFinished();
        }
    }

    async #makePromptQueueData(jobId: string) {
        const res = await comfyGridApiClient.getJobs(jobId);
        if (!res.ok || Object.keys(res.json).length === 0) return null;
        const data = res.json;
        return {
            jobId: data.jobId,
            nodeIds: data.nodeIds,
            prompt: data.prompt,
            workflow: data.workflow,
            ckpt_name: data.ckpt_name,
        };
    }

    #restoreJobWithoutBatchClear(
        jobId: string,
        data: {
            nodeIds: string[];
            ckpt_name?: string | null;
            prompt?: string;
            workflow?: string;
            owner: 'owned' | 'external';
        },
    ) {
        appState.executionState.addQueueJobId(jobId, data.owner);
        gallerySession.trackQueued(jobId);
        this.#registerJob(jobId, {
            ckpt_name: data.ckpt_name,
            prompt: data.prompt,
            workflow: data.workflow,
            owner: data.owner,
        });
        if (data.nodeIds.length > 0) {
            appState.executionState.progress.status = 'processing';
            appState.executionState.progress.setNodeSet(jobId, data.nodeIds);
        }
    }

    async #restoreImagesFromHistoryOutputs(jobId: string, outputs: Record<string, { images: ImageInfo[] }>) {
        const origin = document.location.origin;
        for (const [nodeId, outputData] of Object.entries(outputs)) {
            if (!outputData.images) continue;
            const images = outputData.images.map((img) => {
                const query = new URLSearchParams({
                    filename: img.filename,
                    subfolder: img.subfolder,
                    type: img.type,
                });
                return [`${origin}/api/view?${query.toString()}`];
            });
            await this.handleImageGenerated({ jobId, nodeId, images });
        }
    }

    async #appendQueueFromComfyUi() {
        const res = await comfyUiApiClient.queue();
        if (!res.ok) return;

        const json = res.json;
        for (const jobId of json.queue_running.map((j) => j[1])) {
            const queueData = await this.#makePromptQueueData(jobId);
            this.#restoreJobWithoutBatchClear(jobId, {
                nodeIds: queueData?.nodeIds ?? [],
                ckpt_name: queueData?.ckpt_name,
                prompt: queueData?.prompt,
                workflow: queueData?.workflow,
                owner: 'external',
            });
            if (!appState.executionState.processingJobId) {
                appState.executionState.setProcessingJobId(jobId);
            }
        }

        for (const jobId of json.queue_pending.map((j) => j[1])) {
            const queueData = await this.#makePromptQueueData(jobId);
            this.#restoreJobWithoutBatchClear(jobId, {
                nodeIds: queueData?.nodeIds ?? [],
                ckpt_name: queueData?.ckpt_name,
                prompt: queueData?.prompt,
                workflow: queueData?.workflow,
                owner: 'external',
            });
            if (!appState.executionState.processingJobId) {
                appState.executionState.setProcessingJobId(jobId);
            }
        }
    }

    async #restoreFromHistory() {
        const [historyRes, allJobsRes] = await Promise.all([comfyUiApiClient.history(), comfyGridApiClient.getAllJobs()]);
        if (!historyRes.ok) return;

        const historyJson = historyRes.json;
        const backendJobs = allJobsRes.ok ? allJobsRes.json : {};

        for (const jobId of appState.executionState.queueJobIds.keys()) {
            if (appState.galleryState.isJobCompleted(jobId)) continue;
            const historyEntry = historyJson[jobId];
            if (!historyEntry?.outputs) continue;

            await this.#restoreImagesFromHistoryOutputs(jobId, historyEntry.outputs);
            this.handleExecutionSuccess({ jobId });
        }

        for (const jobId of appState.galleryState.getIncompleteJobIds()) {
            if (appState.executionState.queueJobIds.has(jobId)) continue;
            const historyEntry = historyJson[jobId];
            if (!historyEntry?.outputs) continue;

            const queueData = await this.#makePromptQueueData(jobId);
            this.#restoreJobWithoutBatchClear(jobId, {
                nodeIds: queueData?.nodeIds ?? [],
                ckpt_name: queueData?.ckpt_name,
                prompt: queueData?.prompt,
                workflow: queueData?.workflow,
                owner: 'external',
            });

            await this.#restoreImagesFromHistoryOutputs(jobId, historyEntry.outputs);
            this.handleExecutionSuccess({ jobId });
        }

        for (const [jobId, jobData] of Object.entries(backendJobs)) {
            if (jobData.viewed) continue;
            if (appState.executionState.queueJobIds.has(jobId)) continue;
            if (appState.galleryState.hasJob(jobId)) continue;

            const historyEntry = historyJson[jobId];
            if (!historyEntry?.outputs) continue;

            this.#restoreJobWithoutBatchClear(jobId, {
                nodeIds: jobData.nodeIds ?? [],
                ckpt_name: jobData.ckpt_name,
                prompt: jobData.prompt,
                workflow: jobData.workflow,
                owner: 'external',
            });

            await this.#restoreImagesFromHistoryOutputs(jobId, historyEntry.outputs);
            this.handleExecutionSuccess({ jobId });
        }
    }

    #cleanupOrphanedIncompleteJobs() {
        for (const jobId of appState.galleryState.getIncompleteJobIds()) {
            if (!appState.executionState.queueJobIds.has(jobId)) {
                logger.debug(`Removing orphaned incomplete job ${jobId} (not in queue or history)`);
                this.#removeJob(jobId);
            }
        }
    }
}

export const executionManager = new ExecutionManager();
