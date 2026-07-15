import { SvelteMap } from 'svelte/reactivity';

export const modelTypes = ['models', 'images', 'videos'] as const;
export type ModelTypes = (typeof modelTypes)[number];

export type ModelDirs = 'models' | 'input';

export class Model {
    path: string = $state('');
    full_path: string = $state('');
    name: string = $state('');
    category: string = $state('');
    extension: string = $state('');
    description?: string = $state();
    has_description: boolean = $state(false);
    metadata?: {
        id: string;
        modelId: string;
    } = $state();
    has_metadata: boolean = $state(false);
    retrieved: boolean = $state(false);
    preview?: string = $state();
    nsfw: boolean = $state(false);
    rate?: number = $state();
    favorite: boolean = $state(false);
    trainedWords: string[] = $state([]);
    modified: number = $state(0);
    created: number = $state(0);
    size: number;

    constructor(data: Partial<Model>) {
        Object.assign(this, data);
    }
}

class StorageState {
    readonly #models = new SvelteMap<string, Model>();
    readonly #images = new SvelteMap<string, Model>();
    readonly #videos = new SvelteMap<string, Model>();

    get models(): ReadonlyMap<string, Model> {
        return this.#models;
    }
    get images(): ReadonlyMap<string, Model> {
        return this.#images;
    }
    get videos(): ReadonlyMap<string, Model> {
        return this.#videos;
    }

    setFor(key: ModelTypes, model: Partial<Model>) {
        if (key === 'models') {
            this.setModel({ ...model, retrieved: false });
        } else if (key === 'images') {
            this.setImage({ ...model, retrieved: false });
        } else if (key === 'videos') {
            this.setVideo({ ...model, retrieved: false });
        }
    }

    setModel(model: Partial<Model>) {
        const reactiveModel = new Model(model);
        this.#models.set(reactiveModel.full_path, reactiveModel);
    }
    setImage(model: Partial<Model>) {
        const reactiveModel = new Model(model);
        this.#images.set(reactiveModel.full_path, reactiveModel);
    }
    setVideo(model: Partial<Model>) {
        const reactiveModel = new Model(model);
        this.#videos.set(reactiveModel.full_path, reactiveModel);
    }

    findModel(modelDir: string, modelSubdirs: string[], path: string): Model | undefined {
        return modelSubdirs
            .map((subdir) => {
                const fullPath = [modelDir, subdir, path].join('\\');
                return this.#models.get(fullPath);
            })
            .find(Boolean);
    }

    findModelByFullPath(fullPath: string): Model | undefined {
        return this.#models.get(fullPath);
    }

    clearFor(key: ModelTypes) {
        if (key === 'models') {
            this.#models.clear();
        } else if (key === 'images') {
            this.#images.clear();
        } else if (key === 'videos') {
            this.#videos.clear();
        }
    }

    clearModels() {
        this.#models.clear();
    }
    clearImages() {
        this.#images.clear();
    }
    clearVideos() {
        this.#videos.clear();
    }

    clear() {
        this.#models.clear();
        this.#images.clear();
        this.#videos.clear();
    }
}

export const storageState = new StorageState();
