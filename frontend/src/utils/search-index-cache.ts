import { SearchIndexer } from './search-indexer';

export interface CachedSearchIndex {
    sortedItems: string[];
    itemSet: Set<string>;
    indexer: SearchIndexer<string>;
}

const setCache = new WeakMap<readonly (string | number)[], Set<string>>();
const indexCache = new WeakMap<readonly (string | number)[], CachedSearchIndex>();

/**
 * Fast O(1) set lookup without sorting or indexing overhead.
 */
export function getCachedItemSet(items: readonly (string | number)[]): Set<string> {
    let set = setCache.get(items);
    if (!set) {
        set = new Set<string>();
        for (const item of items) {
            set.add(String(item));
        }
        setCache.set(items, set);
    }
    return set;
}

/**
 * Lazy-loaded sorted items and SearchIndexer, computed on-demand when user focuses/searches.
 */
export function getCachedSearchIndex(items: readonly (string | number)[]): CachedSearchIndex {
    let cached = indexCache.get(items);
    if (!cached) {
        const itemSet = getCachedItemSet(items);
        const sortedItems = items.map((v) => String(v)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        const indexer = new SearchIndexer(sortedItems);
        cached = {
            sortedItems,
            itemSet,
            indexer,
        };
        indexCache.set(items, cached);
    }
    return cached;
}
