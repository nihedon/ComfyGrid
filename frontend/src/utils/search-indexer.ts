export interface SearchItem<T> {
    raw: T;
    text: string;
    lower: string;
}

/**
 * Pre-indexed fast search utility supporting incremental filtering.
 */
export class SearchIndexer<T> {
    #items: SearchItem<T>[] = [];
    #lastQuery = '';
    #lastResults: SearchItem<T>[] = [];

    constructor(items: T[] = [], getText: (item: T) => string = String) {
        this.update(items, getText);
    }

    update(items: T[], getText: (item: T) => string = String): void {
        this.#items = items.map((item) => {
            const text = getText(item);
            return {
                raw: item,
                text,
                lower: text.toLowerCase(),
            };
        });
        this.#lastQuery = '';
        this.#lastResults = this.#items;
    }

    search(query: string): T[] {
        if (!query?.trim()) {
            this.#lastQuery = '';
            this.#lastResults = this.#items;
            return this.#items.map((i) => i.raw);
        }

        const lowerQuery = query.toLowerCase();

        let pool = this.#items;
        if (this.#lastQuery && lowerQuery.startsWith(this.#lastQuery) && this.#lastResults.length > 0) {
            pool = this.#lastResults;
        }

        const filtered = pool.filter((item) => item.lower.includes(lowerQuery));
        this.#lastQuery = lowerQuery;
        this.#lastResults = filtered;

        return filtered.map((item) => item.raw);
    }

    resetQuery(): void {
        this.#lastQuery = '';
        this.#lastResults = this.#items;
    }
}
