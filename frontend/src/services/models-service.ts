import { appState } from '@/states/app-state.svelte';
import type { Model, ModelDirs, ModelTypes } from '@/states/storage-state.svelte';
import { modelTypes } from '@/states/storage-state.svelte';
import logger from '@/utils/logger';

const modelConfigs: Record<ModelTypes, { dir: ModelDirs; extensions: string[] }> = {
    models: { dir: 'models', extensions: ['.safetensors', '.ckpt', '.pth', '.pt', '.onnx', '.bin', '.gguf'] },
    images: { dir: 'input', extensions: ['.png', '.jpg', '.jpeg', '.webp'] },
    videos: { dir: 'input', extensions: ['.webm', '.m4v', '.mp4', '.mkv', '.gif'] },
};

const loading: Record<ModelTypes, boolean> = {
    models: false,
    images: false,
    videos: false,
};

const loadedOnce: Record<ModelTypes, boolean> = {
    models: false,
    images: false,
    videos: false,
};

const storageState = appState.storageState;

async function fetchModels(key: ModelTypes): Promise<void> {
    if (loading[key]) {
        return;
    }
    loading[key] = true;

    try {
        const config = modelConfigs[key];
        const params = new URLSearchParams({
            dir_name: config.dir,
            ext: config.extensions.join(','),
        });
        const resp = await fetch(`/comfygrid/api/list?${params.toString()}`);
        if (!resp.ok) throw new Error(`${key} ${resp.status}`);
        const models = await resp.json();
        storageState.clearFor(key);
        models.forEach((model: Model) => {
            storageState.setFor(key, model);
        });
        loadedOnce[key] = true;
    } catch (e) {
        logger.error(`[models-service] ${key}`, e);
    } finally {
        loading[key] = false;
    }
}

export async function ensureAllModels(): Promise<void> {
    await Promise.all(modelTypes.map(ensureModels));
}

async function ensureModels(key: ModelTypes): Promise<void> {
    if (!loadedOnce[key]) {
        await fetchModels(key);
    }
}

export async function refreshModels(key: ModelTypes): Promise<void> {
    await fetchModels(key);
}
