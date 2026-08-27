import { SvelteMap } from 'svelte/reactivity';

export const modelTypes = ['models', 'images', 'videos'] as const;
export type ModelTypes = (typeof modelTypes)[number];

export type ModelDirs = 'models' | 'input';

export class Model {
    path: string = '';
    full_path: string = '';
    name: string = '';
    category: string = '';
    extension: string = '';
    description?: string = '';
    has_description: boolean = false;
    retrieved: boolean = false;
    preview?: string = '';
    url?: string = '';
    nsfw: boolean = false;
    rate?: number = 0;
    favorite: boolean = false;
    trainedWords: string[] = [];
    modified: number = 0;
    created: number = 0;
    size: number = 0;

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

    deleteFor(key: ModelTypes, full_path: string) {
        if (key === 'models') {
            this.#models.delete(full_path);
        } else if (key === 'images') {
            this.#images.delete(full_path);
        } else if (key === 'videos') {
            this.#videos.delete(full_path);
        }
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
