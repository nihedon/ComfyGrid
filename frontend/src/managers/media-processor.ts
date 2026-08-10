import { SvelteDate } from 'svelte/reactivity';
import { appState } from '@/states/app-state.svelte';
import type { GeneratedAssets } from '@/states/gallery-state.svelte';
import logger from '@/utils/logger';

/**
 * Handles image and video asset creation for generated outputs.
 * Manages preview blob URL lifecycle via {@link JobState}.
 */
class MediaProcessor {
    async onPreviewUpdated(payload: { blob: Blob; jobId?: string; nodeId?: string }) {
        const jobId = payload.jobId ?? appState.executionState.processingJobId;
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
        return MediaProcessor.VIDEO_EXTENSIONS.some((ext) => filename.endsWith(ext));
    }

    async onImageGenerated(jobId: string, nodeId: string, images: string[][]): Promise<string | undefined> {
        let lastBatchJobId: string | undefined;

        const jobInfo = appState.jobState.jobs.get(jobId);
        if (!jobInfo) return;
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

        for (const nId of Object.keys(jobInfo.images)) {
            const nodeImgDatas = jobInfo.images[nId];
            if (nodeImgDatas?.[0]?.previewUrl) {
                URL.revokeObjectURL(nodeImgDatas[0].previewUrl);
                delete jobInfo.images[nId];
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

    async #makeImageAssets(images: string[]): Promise<GeneratedAssets> {
        const thumbnail = images[0];

        if (images.length === 1) {
            return { originalSingle: images[0], thumbnail };
        }
        return { originalCompare: images, thumbnail };
    }

    async #makeVideoAssets(images: string[]): Promise<GeneratedAssets> {
        const videoUrl = images[0];
        const thumbnail = `/comfygrid/api/video_thumbnail?url=${encodeURIComponent(videoUrl)}&size=120`;
        return { videoSingle: videoUrl, isVideo: true, thumbnail };
    }

    clearOtherPreviews(currentJobId: string) {
        for (const [id, jobInfo] of appState.jobState.jobs.entries()) {
            if (id === currentJobId || id.startsWith(`${currentJobId}-`)) continue;
            for (const nodeId of Object.keys(jobInfo.images)) {
                const nodeImgData = jobInfo.images[nodeId]?.[0];
                if (nodeImgData?.previewUrl) {
                    URL.revokeObjectURL(nodeImgData.previewUrl);
                    delete jobInfo.images[nodeId];
                }
            }
        }
    }

    getLastThumbnail(): string | undefined {
        return appState.galleryState.galleryJobs.at(-1)?.thumbnail;
    }
}

export const mediaProcessor = new MediaProcessor();
