import { appState } from '@/states/app-state.svelte';
import type { ItemProps, ResponseData, TagModel } from '../types';

let tagModels: Record<string, TagModel> = Object.create(null);
let tagIndex: Record<string, TagModel[]> = Object.create(null);
const searchCache = new Map<string, ItemProps[]>();

interface TagMatch {
    model: TagModel;
    matchedWords: ItemProps['matchedWords'];
    matchCount: number;
}
export const alwaysUnderscoreTags: Set<string> = new Set();
export const alwaysSpaceTags: Set<string> = new Set();

function getPrefixes(tag: string, maxLen = 3): Set<string> {
    const set: Set<string> = new Set();
    if (!tag) return set;
    for (const t of tag.split(/[ _-]/g)) {
        const len = Math.min(maxLen, t.length);
        for (let i = 1; i <= len; i++) {
            set.add(t.substring(0, i));
        }
    }
    return set;
}

export function buildTagIndex(models: Record<string, TagModel>): void {
    searchCache.clear();
    tagIndex = Object.create(null);
    for (const tagModel of Object.values(models)) {
        if (!tagModel?.value) continue;
        const prefixes = getPrefixes(tagModel.value, 3);
        for (const p of prefixes) {
            if (!(p in tagIndex)) {
                tagIndex[p] = [];
            }
            tagIndex[p].push(tagModel);
        }
    }
}

function registerAlias(alias: string, targetModel: TagModel, source: 'danbooru' | 'e621', categoryStr: string, postCount: number, useCount: number): void {
    const existingAlias = tagModels[alias];
    if (existingAlias) {
        if (existingAlias.source && existingAlias.source !== source) {
            existingAlias.source = 'both';
            if (!existingAlias.sources?.includes(source)) {
                existingAlias.sources?.push(source);
            }
        }
        if (!existingAlias.isOfficial) {
            existingAlias.consequentTagModel = targetModel;
        }
        return;
    }

    const splitAlias = alias.split(/[ _-]/g);
    const aliasTagModel: TagModel = {
        value: alias,
        values: splitAlias,
        flatValue: splitAlias.join(''),
        category: categoryStr,
        useCount,
        postCount,
        consequentTagModel: targetModel,
        isOfficial: false,
        source,
        sources: [source],
    };
    tagModels[alias] = aliasTagModel;
}

export function initializeTagModels(
    resDataOrSources: ResponseData | { data: ResponseData; source: 'danbooru' | 'e621' }[] | undefined,
    defaultSource: 'danbooru' | 'e621' = 'danbooru',
): void {
    if (!resDataOrSources) return;

    const sourcesList: { data: ResponseData; source: 'danbooru' | 'e621' }[] = Array.isArray(resDataOrSources)
        ? resDataOrSources
        : [{ data: resDataOrSources, source: defaultSource }];

    tagModels = Object.create(null);

    for (const { data, source } of sourcesList) {
        if (!data?.tagModels) continue;

        for (const [tag, rawItem] of Object.entries(data.tagModels)) {
            if (!tag || !rawItem) continue;

            const isArray = Array.isArray(rawItem);
            const postCount = isArray ? rawItem[0] : (rawItem.post_count ?? 0);
            const categoryStr = String(isArray ? rawItem[1] : (rawItem.category ?? 0));
            const aliases = isArray ? rawItem[2] : rawItem.aliases;
            const useCount = isArray ? 0 : (rawItem.use_count ?? 0);

            const existing = tagModels[tag];
            if (existing) {
                if (existing.source && existing.source !== source) {
                    existing.source = 'both';
                    if (!existing.sources?.includes(source)) {
                        existing.sources?.push(source);
                    }
                }
                existing.postCount = Math.max(existing.postCount, postCount);
                existing.useCount += useCount;
                if (aliases) {
                    for (const alias of aliases) {
                        if (alias) registerAlias(alias, existing, source, categoryStr, postCount, useCount);
                    }
                }
                continue;
            }

            const splitTag = tag.split(/[ _-]/g);
            const tagModel: TagModel = {
                value: tag,
                values: splitTag,
                flatValue: splitTag.join(''),
                category: categoryStr,
                useCount,
                postCount,
                consequentTagModel: undefined,
                isOfficial: true,
                source,
                sources: [source],
            };

            if (aliases) {
                for (const alias of aliases) {
                    if (alias) registerAlias(alias, tagModel, source, categoryStr, postCount, useCount);
                }
            }
            tagModels[tag] = tagModel;
        }
    }

    buildTagIndex(tagModels);
}

export function getTagModel(tag: string): TagModel | undefined {
    return tagModels[tag];
}

export function searchTag(query: string, maxResults = 30, categoryFilter?: string): ItemProps[] {
    const postCountThreshold = Number(appState.optionState.get('ComfyGrid.prompt_pilot.post_count_threshold') ?? 10);
    const maxResultsByGroup: Record<string, number> = {
        '0': Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_group0') ?? 30),
        '1': Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_group1') ?? 10),
        '3': Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_group3') ?? 10),
        '4': Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_group4') ?? 10),
        '5': Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_group5') ?? 10),
        custom: Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_groupcustom') ?? 20),
    };
    const cacheKey = JSON.stringify([query, String(maxResults), categoryFilter, String(postCountThreshold), ...Object.values(maxResultsByGroup).map(String)]);
    const cached = searchCache.get(cacheKey);
    if (cached) {
        searchCache.delete(cacheKey);
        searchCache.set(cacheKey, cached);
        return cached;
    }
    const queries = query
        .toLowerCase()
        .split(/[ _-]/g)
        .filter((q) => q.trim() !== '');

    if (queries.length === 0) return [];

    let joinedQuery: string | undefined;
    if (queries.length > 1) {
        joinedQuery = queries.join('');
    }

    let resultList: TagMatch[] = [];
    const resultKeySet = new Set<string>();

    queries.forEach((queryForCandidate) => {
        const prefixKey = queryForCandidate.length > 3 ? queryForCandidate.slice(0, 3) : queryForCandidate;
        const candidateTagList = tagIndex[prefixKey];
        if (!candidateTagList) return;

        for (const tagModel of candidateTagList) {
            if (queries.length > 1) {
                if (resultKeySet.has(tagModel.value)) continue;
                resultKeySet.add(tagModel.value);
            }
            if (tagModel.postCount < postCountThreshold && tagModel.useCount === 0) {
                continue;
            }
            if (categoryFilter && categoryFilter !== 'all' && tagModel.category !== categoryFilter) {
                continue;
            }
            const matchedWords: { word: string; index: number }[] = [];

            if (queries.length === 1) {
                const q = queries[0];
                const index = tagModel.flatValue.startsWith(q) ? 0 : tagModel.values.findIndex((word) => word.startsWith(q));
                if (index >= 0) matchedWords.push({ word: q, index });
            } else if (joinedQuery && tagModel.value.startsWith(joinedQuery)) {
                for (let i = 0; i < queries.length; i++) {
                    matchedWords.push({ word: queries[i], index: i });
                }
            } else {
                const matchedQueryIndices = new Set<number>();
                for (const q of queries) {
                    if (!matchedQueryIndices.has(0) && tagModel.flatValue.startsWith(q)) {
                        matchedWords.push({ word: q, index: 0 });
                        matchedQueryIndices.add(0);
                        continue;
                    }
                    for (let i = 0; i < tagModel.values.length; i++) {
                        if (!matchedQueryIndices.has(i) && tagModel.values[i].startsWith(q)) {
                            matchedWords.push({ word: q, index: i });
                            matchedQueryIndices.add(i);
                            break;
                        }
                    }
                }
            }

            if (matchedWords.length > 0) {
                resultList.push({ model: tagModel, matchedWords, matchCount: 0 });
            }
        }
    });

    const consequentTagMatchCount = new Map<string, number>();
    for (const r of resultList) {
        if (!r.model.consequentTagModel) {
            consequentTagMatchCount.set(r.model.value, r.matchedWords.length);
        }
    }

    resultList = resultList.filter((r) => {
        if (!r.model.consequentTagModel) return true;
        const consequentTag = r.model.consequentTagModel.value;
        const count = consequentTagMatchCount.get(consequentTag);
        return count === undefined || count < r.matchedWords.length;
    });

    const resultTagCount = new Map<string, number>();
    if (queries.length > 1) {
        resultList.forEach((r) => {
            r.matchedWords.forEach((m) => {
                const current = resultTagCount.get(m.word) ?? 0;
                resultTagCount.set(m.word, current + 1);
            });
        });

        resultList.forEach((r) => {
            const total = r.matchedWords.reduce((acc, m) => acc + (resultTagCount.get(m.word) ?? 0), 0);
            r.matchCount = total;
        });
    }

    const rank = (a: TagMatch, b: TagMatch) => compare(a, b, query, joinedQuery, queries);
    const groups = new Map<string, TagMatch[]>();
    // Retain the same per-category winners without sorting every matching dictionary entry.
    for (const item of resultList) {
        const cat = String(item.model.category);
        const limit = maxResultsByGroup[cat] ?? 30;
        if (!(limit > 0)) continue;
        const group = groups.get(cat) ?? [];
        if (!groups.has(cat)) groups.set(cat, group);
        if (group.length >= limit && rank(item, group[group.length - 1]) >= 0) continue;
        let low = 0,
            high = group.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (rank(item, group[middle]) < 0) high = middle;
            else low = middle + 1;
        }
        group.splice(low, 0, item);
        if (group.length > Math.ceil(limit)) group.pop();
    }
    const winners = Array.from(groups.values()).flat().sort(rank);
    const results = (maxResults ? winners.slice(0, maxResults) : winners).map(({ model, matchedWords }) => ({
        ...model,
        consequentTagModel: model.consequentTagModel ?? null,
        exists: false,
        matchedWords,
        previewFile: '',
    }));
    if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(cacheKey, results);
    return results;
}

function compare(selfMatch: TagMatch, otherMatch: TagMatch, query: string, joinedQuery: string | undefined, queries: string[]): number {
    const self = selfMatch.model,
        other = otherMatch.model;
    if (self.value === query || (joinedQuery && self.value === joinedQuery)) return -1;
    if (other.value === query || (joinedQuery && other.value === joinedQuery)) return 1;

    if (otherMatch.matchedWords.length !== selfMatch.matchedWords.length) {
        return otherMatch.matchedWords.length - selfMatch.matchedWords.length;
    } else if (queries.length === selfMatch.matchedWords.length) {
        for (let i = 0; i < selfMatch.matchedWords.length; i++) {
            if (selfMatch.matchedWords[i].index !== otherMatch.matchedWords[i].index) {
                return selfMatch.matchedWords[i].index - otherMatch.matchedWords[i].index;
            }
        }
    }

    if (other.useCount !== self.useCount) {
        return other.useCount - self.useCount;
    }
    const count = selfMatch.matchCount - otherMatch.matchCount;
    if (count !== 0) {
        return count;
    }
    if (other.postCount !== self.postCount) {
        return other.postCount - self.postCount;
    }

    return self.value < other.value ? -1 : 1;
}

export function appendTagModel(tagModel: TagModel): void {
    if (tagModel.value && tagModel.value in tagModels) {
        return;
    }
    searchCache.clear();
    tagModels[tagModel.value] = tagModel;
    const prefixes = getPrefixes(tagModel.value, 3);
    for (const p of prefixes) {
        if (!(p in tagIndex)) {
            tagIndex[p] = [];
        }
        tagIndex[p].push(tagModel);
    }
}

export async function fetchTagsFromDanbooruApi(query: string, maxResults = 50, categoryFilter?: string, signal?: AbortSignal): Promise<ItemProps[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const endpoint = `https://danbooru.donmai.us/autocomplete.json?search[query]=${encodeURIComponent(trimmed)}&search[type]=tag&limit=${maxResults}&version=1`;

    try {
        const res = await fetch(endpoint, { signal });
        if (!res.ok) {
            console.error('[PromptPilot] Error fetching online tag data:', res.statusText);
            return [];
        }

        const json = (await res.json()) as Array<{ label: string; category: number; post_count: number; antecedent?: string }>;
        if (signal?.aborted) return [];
        let results: ItemProps[] = json.map((item) => {
            let tag = item.label;
            let consequentTagModel: TagModel | null = null;
            if (item.antecedent) {
                tag = item.antecedent;
                consequentTagModel = tagModels[item.label] ?? null;
            }
            return {
                value: tag,
                category: String(item.category),
                exists: false,
                matchedWords: [{ word: trimmed, index: 0 }],
                useCount: 0,
                postCount: item.post_count,
                consequentTagModel,
                isOfficial: !consequentTagModel,
                previewFile: null,
            };
        });

        if (categoryFilter && categoryFilter !== 'all') {
            results = results.filter((r) => r.category === categoryFilter);
        }

        results.forEach((r) => {
            const splitTag = r.value.split(/[ _-]/g);
            appendTagModel({
                ...r,
                values: splitTag,
                flatValue: splitTag.join(''),
                consequentTagModel: r.consequentTagModel,
                isOfficial: r.isOfficial,
            });
        });

        return results;
    } catch (err) {
        if (signal?.aborted) return [];
        console.error('[PromptPilot] Error fetching tag data from API:', err);
        return [];
    }
}
