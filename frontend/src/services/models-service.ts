import { comfyGridApiClient } from '@/api/api-client';
import { appState } from '@/states/app-state.svelte';
import type { Model, ModelDirs, ModelTypes } from '@/states/storage-state.svelte';
import { modelTypes } from '@/states/storage-state.svelte';
import logger from '@/utils/logger';

const modelConfigs: Record<ModelTypes, { dir: ModelDirs; extensions: string[] }> = {
    models: { dir: 'models', extensions: ['.safetensors', '.ckpt', '.pth', '.pt', '.onnx', '.bin', '.gguf'] },
    images: { dir: 'input', extensions: ['.png', '.jpg', '.jpeg', '.webp'] },
    videos: { dir: 'input', extensions: ['.webm', '.m4v', '.mp4', '.mkv', '.gif'] },
};

const loading: Record<ModelTypes, { promise: Promise<void>; forceRefresh: boolean } | null> = {
    models: null,
    images: null,
    videos: null,
};

const loadedOnce: Record<ModelTypes, boolean> = {
    models: false,
    images: false,
    videos: false,
};

const loadingDetails = new WeakMap<Model, Promise<void>>();

export function fetchModelDetails(model: Model): Promise<void> {
    if (model.retrieved) return Promise.resolve();
    const current = loadingDetails.get(model);
    if (current) return current;

    const promise = requestModelDetails(model)
        .catch((error) => {
            logger.error(`Failed to fetch details for ${model.full_path}:`, error);
        })
        .finally(() => {
            loadingDetails.delete(model);
        });
    loadingDetails.set(model, promise);
    return promise;
}

async function requestModelDetails(model: Model): Promise<void> {
    logger.info(`[${model.name}] fetching details`);
    const res = await comfyGridApiClient.getModelInfo(model.full_path);
    if (!res.ok) throw new Error(`Model details ${res.status}`);
    const data = res.json;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid model details response');
    }

    if (data.description !== undefined) model.description = data.description;
    if (data.url !== undefined) model.url = data.url;
    if (data.nsfw !== undefined) model.nsfw = data.nsfw;
    if (data.rate !== undefined) model.rate = data.rate;
    if (data.favorite !== undefined) model.favorite = data.favorite;
    if (Array.isArray(data.trainedWords)) model.trainedWords = data.trainedWords;
    model.retrieved = true;
}

function fetchModels(key: ModelTypes, forceRefresh: boolean = false): Promise<void> {
    const current = loading[key];
    if (current) {
        if (forceRefresh && !current.forceRefresh) {
            // A cached startup request cannot satisfy an explicit refresh.
            return current.promise.catch(() => undefined).then(() => fetchModels(key, true));
        }
        return current.promise;
    }

    const promise = requestModels(key, forceRefresh)
        .catch((error) => {
            logger.error(`[models-service] ${key}`, error);
            throw error;
        })
        .finally(() => {
            loading[key] = null;
        });
    loading[key] = { promise, forceRefresh };
    return promise;
}

async function requestModels(key: ModelTypes, forceRefresh: boolean): Promise<void> {
    const config = modelConfigs[key];
    const res = await comfyGridApiClient.getList(config.dir, config.extensions, forceRefresh);
    if (!res.ok) throw new Error(`${key} ${res.status}`);
    if (!Array.isArray(res.json)) throw new Error(`Invalid ${key} list response`);

    appState.storageState.clearFor(key);
    res.json.forEach((model: Model) => {
        appState.storageState.setFor(key, model);
    });
    loadedOnce[key] = true;
}

export async function ensureAllModels(): Promise<void> {
    await Promise.all(modelTypes.map(ensureModels));
}

async function ensureModels(key: ModelTypes): Promise<void> {
    if (!loadedOnce[key]) {
        try {
            await fetchModels(key);
        } catch {
            // Startup/prefetch is best-effort; fetchModels already logged the error.
        }
    }
}

export async function refreshModels(key: ModelTypes): Promise<void> {
    await fetchModels(key, true);
}
