import { appState } from '@/states/app-state.svelte';
import type { ItemProps, LoraModel, ResponseData } from '../types';

let loraModels: LoraModel[] = [];

export function initializeLoraModels(resData: ResponseData | undefined): void {
    if (!resData || !resData.loraModels) {
        return;
    }
    loraModels = [];
    Object.entries(resData.loraModels).forEach(([loraName, data]) => {
        loraModels.push({
            value: loraName,
            searchWords: data.search_words || [loraName],
            previewFile: data.preview_file || '',
        });
    });
}

export function searchLora(query: string, maxResults?: number): ItemProps[] {
    const limit = maxResults ?? Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_grouplora') ?? 50);
    const queries = query
        .toLowerCase()
        .split(/[ _-]/g)
        .filter((q) => q.trim() !== '');

    if (queries.length === 0) {
        return loraModels.slice(0, limit).map((lora) => ({
            ...lora,
            matchedWords: [],
            category: 'lora',
            exists: false,
            useCount: 0,
            postCount: 0,
            consequentTagModel: null,
            isOfficial: false,
            previewFile: lora.previewFile || null,
        }));
    }

    let resultSet: ItemProps[] = [];
    loraModels.forEach((lora) => {
        const matchWordSet = new Set<string>();
        for (const word of lora.searchWords) {
            const flatWord = word.replace(/[ _-]/g, '').toLowerCase();
            queries.forEach((q) => {
                if (flatWord.includes(q)) {
                    matchWordSet.add(q);
                }
            });
        }
        if (queries.length === matchWordSet.size) {
            const props: ItemProps = {
                ...lora,
                matchedWords: [...matchWordSet].map((w) => ({ index: 0, word: w })),
                category: 'lora',
                exists: false,
                useCount: 0,
                postCount: 0,
                consequentTagModel: null,
                isOfficial: false,
                previewFile: lora.previewFile || null,
            };
            resultSet.push(props);
        }
    });

    resultSet = resultSet.sort((a, b) => compare(a, b, query, queries));
    return resultSet.slice(0, limit);
}

function compare(self: ItemProps, other: ItemProps, query: string, queries: string[]): number {
    if (self.value === query) return -1;
    if (other.value === query) return 1;

    if (other.matchedWords.length !== self.matchedWords.length) {
        return other.matchedWords.length - self.matchedWords.length;
    }

    const thisStartsQuery = matchStarts(self, queries);
    const otherStartsQuery = matchStarts(other, queries);
    if (thisStartsQuery && !otherStartsQuery) return -1;
    if (!thisStartsQuery && otherStartsQuery) return 1;

    return self.value < other.value ? -1 : 1;
}

function matchStarts(obj: ItemProps, queries: string[]): boolean {
    for (const q of queries) {
        for (const title of obj.value.split(/[ _-]/g)) {
            if (title.toLowerCase().startsWith(q)) {
                return true;
            }
        }
    }
    return false;
}
