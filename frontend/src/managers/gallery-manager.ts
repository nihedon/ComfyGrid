import { comfyGridApiClient } from '@/api/api-client';
import { refreshModels } from '@/services/models-service';
import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';

/**
 * Handles user-initiated actions on gallery images:
 * save, download, upload to input, and send to image info.
 */
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
        const ret = await comfyGridApiClient.postSaveImage(url, metadata);
        if (!ret.ok) {
            logger.error('Failed to save image', ret.text);
            return;
        }
        appState.galleryState.markSaved(node.jobId, node.nodeId, node.batchJobIndex);
    }

    async downloadImage(metadata: Record<string, string>) {
        const { url, node } = this.#currentNodeUrl();
        if (!node || !url) return;

        metadata.batchJobIndex = String(node.batchJobIndex);

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

            const res = await comfyGridApiClient.postUploadToInput(url, filename);
            if (res.ok && res.json.message === 'uploaded') {
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
