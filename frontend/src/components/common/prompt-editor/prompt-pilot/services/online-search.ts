import type { ItemProps } from '../types';

interface PendingSearch {
    query: string;
    controller: AbortController;
    timer?: ReturnType<typeof setTimeout>;
    consumers: Map<object, () => void>;
}

export class OnlineTagSearch {
    private readonly cache = new Map<string, ItemProps[]>();
    private readonly pending = new Map<string, PendingSearch>();
    private readonly owners = new WeakMap<object, PendingSearch>();

    constructor(
        private readonly fetchTags: (query: string, signal: AbortSignal) => Promise<ItemProps[]>,
        private readonly delay = 150,
    ) {}

    request(owner: object, query: string, onReady: () => void): ItemProps[] | undefined {
        const current = this.owners.get(owner);
        if (current?.query === query) {
            current.consumers.set(owner, onReady);
            return undefined;
        }
        this.cancel(owner);
        const cached = this.cache.get(query);
        if (cached) {
            this.cache.delete(query);
            this.cache.set(query, cached);
            return cached;
        }
        let entry = this.pending.get(query);
        if (!entry) {
            entry = { query, controller: new AbortController(), consumers: new Map() };
            this.pending.set(query, entry);
            const search = entry;
            entry.timer = setTimeout(() => {
                void this.run(search);
            }, this.delay);
        }
        entry.consumers.set(owner, onReady);
        this.owners.set(owner, entry);
        return undefined;
    }

    cancel(owner: object) {
        const entry = this.owners.get(owner);
        if (!entry) return;
        this.owners.delete(owner);
        entry.consumers.delete(owner);
        if (!entry.consumers.size) {
            clearTimeout(entry.timer);
            entry.controller.abort();
            if (this.pending.get(entry.query) === entry) this.pending.delete(entry.query);
        }
    }

    private async run(entry: PendingSearch) {
        let results: ItemProps[];
        try {
            results = await this.fetchTags(entry.query, entry.controller.signal);
        } catch {
            results = [];
        }
        if (entry.controller.signal.aborted || this.pending.get(entry.query) !== entry) return;
        this.pending.delete(entry.query);
        if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(entry.query, results);
        const consumers = [...entry.consumers];
        entry.consumers.clear();
        for (const [owner, onReady] of consumers) {
            if (this.owners.get(owner) !== entry) continue;
            this.owners.delete(owner);
            onReady();
        }
    }
}
