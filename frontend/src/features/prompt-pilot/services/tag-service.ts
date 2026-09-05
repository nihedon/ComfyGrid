import { appState } from '@/states/app-state.svelte';
import type { ItemProps, ResponseData, TagModel } from '../types';

let tagModels: Record<string, TagModel> = Object.create(null);
let tagIndex: Record<string, Record<string, TagModel>> = Object.create(null);
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
    tagIndex = Object.create(null);
    for (const tagModel of Object.values(models)) {
        if (!tagModel?.value) continue;
        const prefixes = getPrefixes(tagModel.value, 3);
        for (const p of prefixes) {
            if (!(p in tagIndex)) {
                tagIndex[p] = Object.create(null);
            }
            tagIndex[p][tagModel.value] = tagModel;
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
    const queries = query
        .toLowerCase()
        .split(/[ _-]/g)
        .filter((q) => q.trim() !== '');

    if (queries.length === 0) return [];

    let joinedQuery: string | undefined;
    if (queries.length > 1) {
        joinedQuery = queries.join('');
    }

    let resultList: ItemProps[] = [];
    const resultKeySet = new Set<string>();

    const postCountThreshold = Number(appState.optionState.get('ComfyGrid.prompt_pilot.post_count_threshold') ?? 10);

    queries.forEach((queryForCandidate) => {
        const prefixKey = queryForCandidate.length > 3 ? queryForCandidate.slice(0, 3) : queryForCandidate;
        const candidateTagList = tagIndex[prefixKey];
        if (!candidateTagList) return;

        for (const key in candidateTagList) {
            if (resultKeySet.has(key)) {
                continue;
            }
            const tagModel = candidateTagList[key];
            if (!tagModel || (tagModel.postCount < postCountThreshold && tagModel.useCount === 0)) {
                continue;
            }
            if (categoryFilter && categoryFilter !== 'all' && tagModel.category !== categoryFilter) {
                continue;
            }
            const matchedWords: { word: string; index: number }[] = [];

            if (joinedQuery && tagModel.value.startsWith(joinedQuery)) {
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
                const props: ItemProps = {
                    ...tagModel,
                    consequentTagModel: tagModel.consequentTagModel ?? null,
                    exists: false,
                    matchedWords: matchedWords,
                    previewFile: '',
                };
                resultList.push(props);
                resultKeySet.add(key);
            }
        }
    });

    const consequentTagMatchCount = new Map<string, number>();
    for (const r of resultList) {
        if (!r.consequentTagModel) {
            consequentTagMatchCount.set(r.value, r.matchedWords.length);
        }
    }

    resultList = resultList.filter((r) => {
        if (!r.consequentTagModel) return true;
        const consequentTag = r.consequentTagModel.value;
        const count = consequentTagMatchCount.get(consequentTag);
        return count === undefined || count < r.matchedWords.length;
    });

    const resultTagCount = new Map<string, number>();
    const resultCount = new Map<string, number>();
    resultList.forEach((r) => {
        r.matchedWords.forEach((m) => {
            const current = resultTagCount.get(m.word) ?? 0;
            resultTagCount.set(m.word, current + 1);
        });
    });

    resultList.forEach((r) => {
        const total = r.matchedWords.reduce((acc, m) => acc + (resultTagCount.get(m.word) ?? 0), 0);
        resultCount.set(r.value, total);
    });

    resultList = resultList.sort((a, b) => compare(a, b, query, joinedQuery, queries, resultCount));

    const maxResultsByGroup: Record<string, number> = {
        '0': Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_group0') ?? 30),
        '1': Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_group1') ?? 10),
        '3': Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_group3') ?? 10),
        '4': Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_group4') ?? 10),
        '5': Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_group5') ?? 10),
        custom: Number(appState.optionState.get('ComfyGrid.prompt_pilot.max_results_groupcustom') ?? 20),
    };

    const groupCount: Record<string, number> = {};
    const filteredResults: ItemProps[] = [];
    for (const item of resultList) {
        const cat = String(item.category);
        const limit = maxResultsByGroup[cat] ?? 30;
        const currentCount = groupCount[cat] ?? 0;
        if (currentCount < limit) {
            groupCount[cat] = currentCount + 1;
            filteredResults.push(item);
        }
    }

    return maxResults ? filteredResults.slice(0, maxResults) : filteredResults;
}

function compare(
    self: ItemProps,
    other: ItemProps,
    query: string,
    joinedQuery: string | undefined,
    queries: string[],
    resultCount: Map<string, number>,
): number {
    if (self.value === query || (joinedQuery && self.value === joinedQuery)) return -1;
    if (other.value === query || (joinedQuery && other.value === joinedQuery)) return 1;

    if (other.matchedWords.length !== self.matchedWords.length) {
        return other.matchedWords.length - self.matchedWords.length;
    } else if (queries.length === self.matchedWords.length) {
        for (let i = 0; i < self.matchedWords.length; i++) {
            if (self.matchedWords[i].index !== other.matchedWords[i].index) {
                return self.matchedWords[i].index - other.matchedWords[i].index;
            }
        }
    }

    if (other.useCount !== self.useCount) {
        return other.useCount - self.useCount;
    }
    const selfCount = resultCount.get(self.value) ?? 0;
    const otherCount = resultCount.get(other.value) ?? 0;
    const count = selfCount - otherCount;
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
    tagModels[tagModel.value] = tagModel;
    const prefixes = getPrefixes(tagModel.value, 3);
    for (const p of prefixes) {
        if (!(p in tagIndex)) {
            tagIndex[p] = Object.create(null);
        }
        tagIndex[p][tagModel.value] = tagModel;
    }
}

export async function fetchTagsFromDanbooruApi(query: string, maxResults = 50, categoryFilter?: string): Promise<ItemProps[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const endpoint = `https://danbooru.donmai.us/autocomplete.json?search[query]=${encodeURIComponent(trimmed)}&search[type]=tag&limit=${maxResults}&version=1`;

    try {
        const res = await fetch(endpoint);
        if (!res.ok) {
            console.error('[PromptPilot] Error fetching online tag data:', res.statusText);
            return [];
        }

        const json = (await res.json()) as Array<{ label: string; category: number; post_count: number; antecedent?: string }>;
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
        console.error('[PromptPilot] Error fetching tag data from API:', err);
        return [];
    }
}
