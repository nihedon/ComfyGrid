import { ensureAllModels } from '@/services/models-service';
import { appState } from '@/states/app-state.svelte';
import type { Model } from '@/states/storage-state.svelte';
import type { ItemProps, LoraModel } from '../types';

interface IndexedLora extends LoraModel {
    flatWords: string[];
    titleWords: string[];
    path: string;
    name: string;
    trainedWords: string;
}

const modelCache = new WeakMap<Model, IndexedLora>();
const searchCache = new Map<string, ItemProps[]>();
let previousModels: IndexedLora[] = [];

function asCompletion(lora: IndexedLora, matchedWords: ItemProps['matchedWords']): ItemProps {
    const base: LoraModel = { value: lora.value, searchWords: lora.searchWords, previewFile: lora.previewFile, model: lora.model };
    return {
        ...base,
        matchedWords,
        category: 'lora',
        exists: false,
        useCount: 0,
        postCount: 0,
        consequentTagModel: null,
        isOfficial: false,
        previewFile: lora.previewFile || null,
        model: lora.model,
    };
}

function getLoraModels(): IndexedLora[] {
    if (appState.storageState.models.size === 0) {
        void ensureAllModels();
    }

    const loras: IndexedLora[] = [];
    for (const model of appState.storageState.models.values()) {
        if (model.category !== 'loras') continue;
        const trainedWords = JSON.stringify(model.trainedWords ?? []);
        const cached = modelCache.get(model);
        if (
            cached &&
            cached.path === model.path &&
            cached.name === model.name &&
            cached.trainedWords === trainedWords &&
            cached.previewFile === (model.preview || '')
        ) {
            loras.push(cached);
            continue;
        }

        const normalizedPath = model.path.replaceAll('\\', '/');
        const valueWithoutExt = normalizedPath.replace(/\.[^/.]+$/, '');
        const searchWords = new Set<string>([valueWithoutExt, model.name, ...valueWithoutExt.split('/'), ...(model.trainedWords ?? [])]);

        const indexed: IndexedLora = {
            value: valueWithoutExt,
            searchWords: [...searchWords],
            previewFile: model.preview || '',
            model,
            flatWords: [...searchWords].map((word) => word.replace(/[ _\-/]/g, '').toLowerCase()),
            titleWords: valueWithoutExt.toLowerCase().split(/[ _\-/]/g),
            path: model.path,
            name: model.name,
            trainedWords,
        };
        modelCache.set(model, indexed);
        loras.push(indexed);
    }
    if (loras.length !== previousModels.length || loras.some((model, index) => model !== previousModels[index])) {
        searchCache.clear();
        previousModels = loras;
    }
    return loras;
}

export function searchLora(query: string, maxResults?: number): ItemProps[] {
    const limit = maxResults ?? Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_grouplora') ?? 50);
    const loraModels = getLoraModels();
    const cacheKey = JSON.stringify([query, String(limit)]);
    const cached = searchCache.get(cacheKey);
    if (cached) {
        searchCache.delete(cacheKey);
        searchCache.set(cacheKey, cached);
        return cached;
    }
    const queries = query
        .toLowerCase()
        .split(/[ _\-/]/g)
        .filter((q) => q.trim() !== '');

    if (queries.length === 0) {
        return loraModels.slice(0, limit).map((lora) => asCompletion(lora, []));
    }

    let resultSet: ItemProps[] = [];
    const prefixMatches = new Set<string>();
    loraModels.forEach((lora) => {
        const matchWordSet = new Set<string>();
        for (const flatWord of lora.flatWords) {
            queries.forEach((q) => {
                if (flatWord.includes(q)) {
                    matchWordSet.add(q);
                }
            });
        }
        if (queries.length === matchWordSet.size) {
            if (queries.some((q) => lora.titleWords.some((word) => word.startsWith(q)))) prefixMatches.add(lora.value);
            const props = asCompletion(
                lora,
                [...matchWordSet].map((w) => ({ index: 0, word: w })),
            );
            resultSet.push(props);
        }
    });

    resultSet = resultSet.sort((a, b) => compare(a, b, query, prefixMatches));
    const results = resultSet.slice(0, limit);
    if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(cacheKey, results);
    return results;
}

function compare(self: ItemProps, other: ItemProps, query: string, prefixMatches: Set<string>): number {
    if (self.value === query) return -1;
    if (other.value === query) return 1;

    if (other.matchedWords.length !== self.matchedWords.length) {
        return other.matchedWords.length - self.matchedWords.length;
    }

    const thisStartsQuery = prefixMatches.has(self.value);
    const otherStartsQuery = prefixMatches.has(other.value);
    if (thisStartsQuery && !otherStartsQuery) return -1;
    if (!thisStartsQuery && otherStartsQuery) return 1;

    return self.value < other.value ? -1 : 1;
}
