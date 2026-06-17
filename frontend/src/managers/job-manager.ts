import { SvelteDate } from 'svelte/reactivity';
import { comfyGridApiClient } from '@/api/api-client';
import { appState } from '@/states/app-state.svelte';
import type { GeneratedAssets } from '@/states/gallery-state.svelte';
import type { JobInfo } from '@/states/job-state.svelte';
import logger from '@/utils/logger';

/**
 * Manages in-progress job records in `jobState` and syncs completed data to `galleryState`.
 * jobState entries are deleted immediately upon completion.
 * Hierarchy: Job -> Nodes -> ImageInfo
 */
class JobManager {
    registerQueuedJob(jobId: string, metadata: JobInfo['metadata']): void {
        const jobInfo = {
            jobId,
            images: {},
            createdAt: Date.now(),
            metadata,
        };
        appState.jobState.setJob(jobId, jobInfo);
        appState.galleryState.upsertJob(jobId, { metadata, createdAt: jobInfo.createdAt });
    }

    appendJobMetadata(jobId: string, meta: Record<string, string>): void {
        const jobInfo = appState.jobState.jobs.get(jobId);
        if (!jobInfo) return;
        jobInfo.metadata = { ...jobInfo.metadata, ...meta };
        appState.galleryState.upsertJob(jobId, { metadata: jobInfo.metadata });
    }

    async onPreviewUpdated(payload: { blob: Blob; jobId?: string; nodeId?: string }) {
        const jobId = payload.jobId ?? appState.executionState.lastProcessedJobId;
        const nodeId = payload.nodeId ?? appState.executionState.executingNodeId;
        if (!jobId || !nodeId) {
            logger.error('Job ID and node ID are required to update preview');
            return;
        }

        const jobInfo = appState.jobState.jobs.get(jobId);
        if (!jobInfo) return;
        if (!jobInfo.images[nodeId]) {
            jobInfo.images[nodeId] = [{ nodeId, batchJobIndex: 0, previewUrl: undefined }];
        }

        const nodeImageData = jobInfo.images[nodeId][0];
        if (nodeImageData.previewUrl) {
            URL.revokeObjectURL(nodeImageData.previewUrl);
        }
        const dataUrl = URL.createObjectURL(payload.blob);
        nodeImageData.previewUrl = dataUrl;

        const nodeName = appState.workspaceState.getRealNode(nodeId)?.title ?? nodeId;
        appState.galleryState.upsertNode(jobId, {
            nodeId,
            batchJobIndex: 0,
            nodeName,
            assets: undefined,
            saved: false,
            downloaded: false,
            previewUrl: dataUrl,
        });
    }

    private static readonly VIDEO_EXTENSIONS = ['.webm', '.m4v', '.mp4', '.mkv', '.gif'];

    private isVideoUrl(url: string): boolean {
        const filename = (new URL(url).searchParams.get('filename') ?? '').toLowerCase();
        return JobManager.VIDEO_EXTENSIONS.some((ext) => filename.endsWith(ext));
    }

    async onImageGenerated(jobId: string, nodeId: string, images: string[][]): Promise<string | undefined> {
        let lastBatchJobId: string | undefined;

        const jobInfo = appState.jobState.jobs.get(jobId);
        if (!jobInfo) return;
        // Spread to strip Svelte reactive Proxy before passing to galleryState
        jobInfo.metadata = { ...jobInfo.metadata, datetime: new SvelteDate().toISOString() };
        appState.galleryState.upsertJob(jobId, { metadata: { ...jobInfo.metadata } });

        jobInfo.images[nodeId] = [];
        for (let i = 0; i < images.length; i++) {
            const batchJobId = i === 0 ? jobId : `${jobId}-${i}`;
            lastBatchJobId = batchJobId;

            const assets = await this.#makeGeneratedAssets(images[i]);
            jobInfo.images[nodeId].push({ nodeId, batchJobIndex: i, previewUrl: undefined });

            const nodeName = appState.workspaceState.getRealNode(nodeId)?.title ?? nodeId;
            appState.galleryState.upsertNode(jobId, {
                nodeId,
                batchJobIndex: i,
                nodeName,
                assets,
                saved: false,
                downloaded: false,
                previewUrl: undefined,
            });
        }

        // Remove preview-only intermediate nodes (e.g. KSampler) from both jobState and galleryState
        for (const nodeId of Object.keys(jobInfo.images)) {
            const nodeImgDatas = jobInfo.images[nodeId];
            if (nodeImgDatas?.[0]?.previewUrl) {
                URL.revokeObjectURL(nodeImgDatas[0].previewUrl);
                delete jobInfo.images[nodeId];
            }
        }
        appState.galleryState.removePreviewOnlyNodes(jobId);

        return lastBatchJobId;
    }

    async #makeGeneratedAssets(images: string[]): Promise<GeneratedAssets> {
        if (this.isVideoUrl(images[0])) {
            return this.#makeVideoAssets(images);
        }
        return this.#makeImageAssets(images);
    }

    async #resizeImage(url: string, size: number) {
        try {
            const r = await comfyGridApiClient.getResize(url, size);
            if (r.ok) {
                return r.blob;
            }
        } catch (e: unknown) {
            logger.error('Failed to resize image:', e);
        }
        return url;
    }

    async #makeImageAssets(images: string[]): Promise<GeneratedAssets> {
        const mediums = await Promise.all(images.map((url) => this.#resizeImage(url, 1024)));
        const mediumUrls = mediums.map((medium: Blob | string) => {
            if (typeof medium === 'string') {
                return medium;
            } else {
                return URL.createObjectURL(medium);
            }
        });

        const thumb = await this.#resizeImage(images[0], 120);
        let thumbnail: string;
        if (typeof thumb === 'string') {
            thumbnail = thumb;
        } else {
            thumbnail = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(thumb);
            });
        }
        if (images.length === 1) {
            return { originalSingle: images[0], mediumSingle: mediumUrls[0], thumbnail };
        }
        return { originalCompare: images, mediumCompare: mediumUrls, thumbnail };
    }

    async #makeVideoAssets(images: string[]): Promise<GeneratedAssets> {
        let thumbnail = '';
        try {
            const res = await comfyGridApiClient.getVideoThumbnail(images[0], 120);
            if (res.ok) {
                thumbnail = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(res.blob);
                });
            }
        } catch (e) {
            logger.error('Failed to generate video thumbnail', e);
        }
        return { videoSingle: images[0], isVideo: true, thumbnail };
    }

    markJobCompleted(jobId: string) {
        const jobIds = Array.from(appState.jobState.jobs.keys());
        const relatedIds = jobIds.filter((id) => id === jobId || id.startsWith(`${jobId}-`));
        for (const id of relatedIds) {
            const jobInfo = appState.jobState.jobs.get(id);
            if (!jobInfo) continue;
            const duration = Date.now() - jobInfo.createdAt;
            appState.galleryState.markCompleted(id, duration);
            appState.jobState.deleteJob(id);
            logger.log(`Job ${id} completed in ${(duration / 1000).toFixed(2)}s`);
        }
    }

    removeJob(jobId: string) {
        const jobIds = Array.from(appState.jobState.jobs.keys());
        const relatedIds = jobIds.filter((id) => id === jobId || id.startsWith(`${jobId}-`));
        relatedIds.forEach((id) => {
            appState.jobState.deleteJob(id);
            appState.galleryState.deleteJob(id);
        });
        // Handle case where job wasn't registered in jobState (e.g., already completed)
        appState.galleryState.deleteJob(jobId);
    }

    removeSpecificJob(jobId: string) {
        appState.jobState.deleteJob(jobId);
    }

    deleteJob(jobId: string) {
        appState.galleryState.deleteJob(jobId);
    }

    clearSavedJobs() {
        appState.galleryState.clearSavedJobs();
    }

    clearViewedJobs() {
        appState.galleryState.clearViewedJobs();
    }

    clearAllJobs() {
        appState.galleryState.clearAllJobs();
    }

    cleanupViewedJobs() {
        appState.galleryState.clearViewedJobs();
    }

    clearOtherPreviews(currentJobId: string) {
        for (const [id, jobInfo] of appState.jobState.jobs.entries()) {
            if (id === currentJobId || id.startsWith(`${currentJobId}-`)) continue;
            for (const key of Object.keys(jobInfo.images)) {
                const nId = Number(key);
                const nodeImgData = jobInfo.images[nId]?.[0];
                if (nodeImgData?.previewUrl) {
                    URL.revokeObjectURL(nodeImgData.previewUrl);
                    delete jobInfo.images[nId];
                }
            }
        }
    }

    async saveImage(url: string, metadata: Record<string, string>): Promise<boolean> {
        const ret = await comfyGridApiClient.postSaveImage(url, metadata);
        if (!ret.ok) {
            logger.error('Failed to save image', ret.text);
            return false;
        }
        return true;
    }

    downloadImage(url: string, metadata: Record<string, string>) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/comfygrid/api/download_image';
        form.style.display = 'none';
        form.target = '_blank';

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'form';
        input.value = JSON.stringify({ url, image_info: metadata });
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();
        form.remove();
    }

    getLastThumbnail(): string | undefined {
        const jobs = [...appState.galleryState.galleryJobs];
        return jobs.at(-1)?.thumbnail;
    }
}

export const jobManager = new JobManager();
