type TranslateTask = () => Promise<void>;

class TranslationManager {
    readonly #tasks = new Map<string, TranslateTask>();
    readonly #activePromises = new Set<Promise<void>>();

    register(id: string, task: TranslateTask) {
        this.#tasks.set(id, task);
    }

    unregister(id: string) {
        this.#tasks.delete(id);
    }

    trackPromise(promise: Promise<void>) {
        this.#activePromises.add(promise);
        promise.finally(() => {
            this.#activePromises.delete(promise);
        });
    }

    get isTranslating(): boolean {
        return this.#activePromises.size > 0;
    }

    async translateAllPending() {
        const tasks = Array.from(this.#tasks.values());
        this.#tasks.clear();
        const promises = tasks.map((task) => task());
        promises.forEach((p) => this.trackPromise(p));
        await Promise.all(promises);
    }

    async waitForAllTranslations(): Promise<void> {
        await this.translateAllPending();
        while (this.#activePromises.size > 0) {
            await Promise.all(Array.from(this.#activePromises));
        }
    }
}

export const translationManager = new TranslationManager();
