import { comfyGridApiClient } from '@/api/api-client';
import type { Model, ModelTypes } from '@/states/storage-state.svelte';
import logger from '@/utils/logger';

class ModalState {
    #selectedModelPath: string = $state();
    #modelDir: ModelTypes = $state();
    #modelSubdirs: string[] = $state();
    #valueSet: Set<string> | null = $state();
    #handleSelect: (model: Model) => void;

    setup(selectedModelPath: string, modelDir: ModelTypes, modelSubdirs: string[], valueSet: Set<string> | null, onSelect: (model: Model) => void) {
        this.#selectedModelPath = selectedModelPath;
        this.#modelDir = modelDir;
        this.#modelSubdirs = modelSubdirs;
        this.#valueSet = valueSet;
        this.#handleSelect = onSelect;
    }

    get selectedModelPath() {
        return this.#selectedModelPath;
    }
    get modelDir() {
        return this.#modelDir;
    }
    get modelSubdirs(): ReadonlyArray<string> {
        return this.#modelSubdirs;
    }
    get valueSet(): ReadonlySet<string> {
        return this.#valueSet;
    }
    get handleSelect() {
        return this.#handleSelect;
    }

    clearModelDir() {
        this.#modelDir = null;
    }

    clearCallback() {
        this.#handleSelect = null;
    }
}

class InpaintModalState {
    #baseImage: {
        filename: string;
        subfolder: string;
    } = $state();
    #imageUrl: string = $state(null);

    #handleUpload: (filename: string) => void;

    setup(
        baseImage: {
            filename: string;
            subfolder: string;
            type?: string;
        },
        imageUrl: string | null,
        handleUpload: (filename: string) => void,
    ) {
        this.#baseImage = baseImage;
        this.#imageUrl = imageUrl;
        this.#handleUpload = handleUpload;
    }

    get baseImage() {
        return this.#baseImage;
    }
    get imageUrl() {
        return this.#imageUrl;
    }
    get handleUpload() {
        return this.#handleUpload;
    }

    async savePaint(maskDataUrl: string, imageDataUrl: string) {
        try {
            // Get image blob from data URL (this is the potentially resized image)
            const [maskBlob, imageBlob] = await Promise.all([
                (async () => {
                    // Get mask blob from data URL
                    const maskRes = await fetch(maskDataUrl);
                    return maskRes.blob();
                })(),
                (async () => {
                    // Get image blob from data URL (this is the potentially resized image)
                    const imageRes = await fetch(imageDataUrl);
                    return imageRes.blob();
                })(),
            ]);

            // Prepare filename
            let filename = this.#baseImage.filename;
            const lastDotIndex = filename.lastIndexOf('.');
            if (lastDotIndex !== -1) {
                filename = filename.substring(0, lastDotIndex);
            }
            if (!filename.endsWith('_mask')) {
                filename += '_mask';
            }
            filename += '.png';

            // Upload to apply mask endpoint
            const res = await comfyGridApiClient.postApplyMask({
                file: { blob: imageBlob, filename: 'original.png' },
                mask: { blob: maskBlob, filename: 'mask.png' },
                filename,
                subfolder: this.#baseImage.subfolder,
            });

            if (res.ok && res.json?.message === 'uploaded') {
                this.handleUpload?.(filename);
            }
        } catch (e) {
            logger.error('Failed to apply mask', e);
        }
    }

    closePaintModal() {
        this.#imageUrl = '';
        this.#handleUpload = null;
    }
}

export const modalState = new ModalState();
export const inpaintModalState = new InpaintModalState();

class DescriptionModalState {
    #model = $state<Model | null>(null);

    get model() {
        return this.#model;
    }

    show(model: Model) {
        this.#model = model;
    }

    close() {
        this.#model = null;
    }
}

export const descriptionModalState = new DescriptionModalState();
