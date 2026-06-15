import { refreshModels } from '@/services/models-service';
import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';
import { jobManager } from './job-manager';

class GalleryManager {
    #currentNodeUrl() {
        const node = appState.galleryState.currentGalleryNode;
        if (!node?.assets) return { url: null, node: null };
        return {
            url:
                node.assets.videoSingle ?? node.assets.originalSingle ?? node.assets.originalCompare?.[appState.galleryState.selectedCompareIndex ?? 0] ?? null,
            node,
        };
    }

    async saveImage(metadata: Record<string, string>) {
        const { url, node } = this.#currentNodeUrl();
        if (!node || !url) return;

        metadata.batchJobIndex = String(node.batchJobIndex);
        const success = await jobManager.saveImage(url, metadata);
        if (success) {
            appState.galleryState.markSaved(node.jobId, node.nodeId, node.batchJobIndex);
        }
    }

    async downloadImage(metadata: Record<string, string>) {
        const { url, node } = this.#currentNodeUrl();
        if (!node || !url) return;

        metadata.batchJobIndex = String(node.batchJobIndex);
        jobManager.downloadImage(url, metadata);
        appState.galleryState.markDownloaded(node.jobId, node.nodeId, node.batchJobIndex);
    }

    async uploadToInput() {
        const { url } = this.#currentNodeUrl();
        if (!url) return;

        try {
            const params = new URL(url).searchParams;
            const originalFilename = params.get('filename') ?? 'image.png';
            const ext = originalFilename.substring(originalFilename.lastIndexOf('.')) || '.png';
            const filename = `gallery_${Date.now()}${ext}`;

            const res = await fetch('/comfygrid/api/upload_to_input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, filename }),
            });

            const { message } = await res.json();
            if (message === 'uploaded') {
                refreshModels('images');
            }
        } catch (e) {
            logger.error('Failed to upload to input', e);
        }
    }

    async sendToImageInfo() {
        const { url } = this.#currentNodeUrl();
        if (!url) return;

        try {
            const params = new URL(url).searchParams;
            const filename = params.get('filename') ?? 'image.png';

            const res = await fetch(url);
            const blob = await res.blob();
            const file = new File([blob], filename, { type: blob.type });

            appState.uiState.fileToOpenInImageInfo = file;
            appState.uiState.activePageId = 'image-info';
        } catch (e) {
            logger.error('Failed to send image to info', e);
        }
    }
}

export const galleryManager = new GalleryManager();
