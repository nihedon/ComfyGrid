type TranslateTask = () => Promise<void>;

class TranslationManager {
    readonly #tasks = new Map<string, TranslateTask>();
    readonly #activePromises = new Set<Promise<void>>();
    readonly #participants = new Map<symbol, { cancel: () => void; registerPending: () => void }>();
    #cancelController = new AbortController();
    #pendingQueueCount = $state(0);

    register(id: string, task: TranslateTask) {
        this.#tasks.set(id, task);
    }

    unregister(id: string) {
        this.#tasks.delete(id);
    }

    registerCancellation(id: string, cancel: () => void, registerPending: () => void): () => void {
        const participant = { cancel, registerPending };
        const key = Symbol(id);
        this.#participants.set(key, participant);
        return () => {
            this.#participants.delete(key);
            cancel();
        };
    }

    registerPendingTranslations() {
        for (const participant of this.#participants.values()) {
            participant.registerPending();
        }
    }

    get cancellationSignal(): AbortSignal {
        return this.#cancelController.signal;
    }

    cancelPendingQueues() {
        this.#cancelController.abort();
        this.#cancelController = new AbortController();
        this.#pendingQueueCount = 0;
    }

    cancelAll() {
        this.cancelPendingQueues();
        this.#tasks.clear();
        for (const participant of this.#participants.values()) {
            participant.cancel();
        }
        this.#activePromises.clear();
    }

    trackPromise(promise: Promise<void>) {
        this.#activePromises.add(promise);
        const cleanup = () => {
            this.#activePromises.delete(promise);
        };
        void promise.then(cleanup, cleanup);
    }

    get isTranslating(): boolean {
        return this.#activePromises.size > 0;
    }

    get hasPendingTasks(): boolean {
        return this.#tasks.size > 0;
    }

    get pendingQueueCount(): number {
        return this.#pendingQueueCount;
    }

    incrementPendingQueue(count: number = 1) {
        this.#pendingQueueCount += count;
    }

    decrementPendingQueue(count: number = 1) {
        this.#pendingQueueCount = Math.max(0, this.#pendingQueueCount - count);
    }

    async translateAllPending() {
        const tasks = Array.from(this.#tasks.values());
        this.#tasks.clear();
        const promises = tasks.map((task) => task());
        promises.forEach((p) => this.trackPromise(p));
        await Promise.all(promises);
    }

    async waitForAllTranslations(signal = this.cancellationSignal): Promise<boolean> {
        if (signal.aborted) return false;
        let onAbort: () => void;
        const cancelled = new Promise<boolean>((resolve) => {
            onAbort = () => resolve(false);
            signal.addEventListener('abort', onAbort, { once: true });
        });
        const wait = async () => {
            while (!signal.aborted && (this.hasPendingTasks || this.#activePromises.size > 0)) {
                await this.translateAllPending();
                if (!signal.aborted && this.#activePromises.size > 0) {
                    await Promise.all(Array.from(this.#activePromises));
                }
            }
            return !signal.aborted;
        };
        try {
            return await Promise.race([wait(), cancelled]);
        } finally {
            signal.removeEventListener('abort', onAbort!);
        }
    }
}

export const translationManager = new TranslationManager();
