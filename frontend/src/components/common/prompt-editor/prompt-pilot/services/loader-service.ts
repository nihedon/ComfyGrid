import { gunzipSync } from 'fflate';
import { appState } from '@/states/app-state.svelte';
import type { ResponseData } from '../types';
import { getCachedDictionary, setCachedDictionary } from './cache-service';
import { initializeTagModels } from './tag-service';

let loadedSource: string | null = null;
let currentLoad: { source: string; promise: Promise<boolean> } | null = null;
let loadVersion = 0;

const DEFAULT_TAG_SOURCE = 'danbooru.donmai.us';

export function getActiveTagSource(): string {
    return (appState.optionState.get('ComfyGrid.prompt_pilot.tag_source') as string) || DEFAULT_TAG_SOURCE;
}

const cachedRawData: Record<string, ResponseData> = Object.create(null);
const sourceLoads = new Map<string, Promise<ResponseData | null>>();

async function decompressAndParse(res: Response): Promise<ResponseData> {
    const buffer = new Uint8Array(await res.arrayBuffer());
    const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    let jsonString: string;

    if (isGzip) {
        // Try browser native DecompressionStream first
        if (typeof DecompressionStream !== 'undefined') {
            try {
                const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
                jsonString = await new Response(stream).text();
                return JSON.parse(jsonString) as ResponseData;
            } catch (e) {
                console.warn('[PromptPilot] DecompressionStream failed, falling back to fflate:', e);
            }
        }

        // Fallback using fflate
        const decompressed = gunzipSync(buffer);
        jsonString = new TextDecoder('utf-8').decode(decompressed);
    } else {
        // Already decompressed by browser or dev server
        jsonString = new TextDecoder('utf-8').decode(buffer);
    }

    return JSON.parse(jsonString) as ResponseData;
}

async function validateCacheInBackground(sourceName: string, cachedEtag?: string, cachedLastModified?: string, cachedLength?: string): Promise<void> {
    try {
        const res = await fetch(`/comfygrid/${sourceName}.json.gz`, { method: 'HEAD' });
        if (!res.ok) return;

        const currentEtag = res.headers.get('etag') || undefined;
        const currentLastModified = res.headers.get('last-modified') || undefined;
        const currentLength = res.headers.get('content-length') || undefined;

        const isChanged =
            (currentEtag && cachedEtag !== currentEtag) ||
            (currentLastModified && cachedLastModified !== currentLastModified) ||
            (currentLength && cachedLength !== currentLength);

        if (isChanged) {
            console.info(`[PromptPilot] Dictionary file changed on server for ${sourceName}. Updating IndexedDB cache...`);
            const fetchRes = await fetch(`/comfygrid/${sourceName}.json.gz`);
            if (fetchRes.ok) {
                const newData = await decompressAndParse(fetchRes);
                await setCachedDictionary(sourceName, newData, currentEtag, currentLastModified, currentLength);
                cachedRawData[sourceName] = newData;
                console.info(`[PromptPilot] IndexedDB cache successfully updated for ${sourceName}.`);
            }
        }
    } catch {
        // Silently ignore background revalidation errors
    }
}

function fetchSourceData(sourceName: string): Promise<ResponseData | null> {
    if (cachedRawData[sourceName]) {
        return Promise.resolve(cachedRawData[sourceName]);
    }
    const pending = sourceLoads.get(sourceName);
    if (pending) return pending;

    const promise = requestSourceData(sourceName).finally(() => sourceLoads.delete(sourceName));
    sourceLoads.set(sourceName, promise);
    return promise;
}

async function requestSourceData(sourceName: string): Promise<ResponseData | null> {
    // 1. Check IndexedDB cache first
    try {
        const cached = await getCachedDictionary(sourceName);
        if (cached?.data) {
            cachedRawData[sourceName] = cached.data;
            validateCacheInBackground(sourceName, cached.etag, cached.lastModified, cached.contentLength);
            return cached.data;
        }
    } catch (e) {
        console.warn(`[PromptPilot] Error reading cache for ${sourceName}:`, e);
    }

    // 2. Fetch and decompress from server
    try {
        const fileName = `${sourceName}.json.gz`;
        const res = await fetch(`/comfygrid/${fileName}`);
        if (!res.ok) {
            console.error(`[PromptPilot] Failed to fetch ${fileName}:`, res.statusText);
            return null;
        }

        const etag = res.headers.get('etag') || undefined;
        const lastModified = res.headers.get('last-modified') || undefined;
        const contentLength = res.headers.get('content-length') || undefined;

        const data = await decompressAndParse(res);
        cachedRawData[sourceName] = data;

        setCachedDictionary(sourceName, data, etag, lastModified, contentLength).catch(() => {});

        return data;
    } catch (error) {
        console.error(`[PromptPilot] Error loading ${sourceName}.json.gz:`, error);
        return null;
    }
}

export function ensurePromptPilotModelsLoaded(tagSource?: string): Promise<boolean> {
    const selectedSource = getActiveTagSource();
    const targetSource = tagSource || selectedSource;
    if (currentLoad?.source === targetSource) return currentLoad.promise;

    const version = ++loadVersion;
    if (loadedSource === targetSource) {
        currentLoad = null;
        return Promise.resolve(true);
    }

    const promise = (async () => {
        try {
            const sources: { data: ResponseData; source: 'danbooru' | 'e621' }[] = [];
            if (targetSource === 'all') {
                const [danbooruData, e621Data] = await Promise.all([fetchSourceData('danbooru.donmai.us'), fetchSourceData('e621.net')]);

                if (danbooruData) sources.push({ data: danbooruData, source: 'danbooru' });
                if (e621Data) sources.push({ data: e621Data, source: 'e621' });
            } else {
                const source = targetSource === 'e621.net' ? 'e621' : 'danbooru';
                const data = await fetchSourceData(targetSource);
                if (data) sources.push({ data, source });
            }

            // Older loads may populate the raw cache, but must not replace the active dictionary.
            if (version !== loadVersion || selectedSource !== getActiveTagSource() || sources.length === 0) return false;
            initializeTagModels(sources);
            loadedSource = targetSource;
            return true;
        } catch (error) {
            console.error(`[PromptPilot] Error loading models for ${targetSource}:`, error);
            return false;
        } finally {
            if (version === loadVersion) currentLoad = null;
        }
    })();

    currentLoad = { source: targetSource, promise };
    return promise;
}

if (typeof globalThis.onOptionsChanged === 'function') {
    globalThis.onOptionsChanged(() => {
        const newSource = getActiveTagSource();
        if ((loadedSource || currentLoad) && (currentLoad?.source ?? loadedSource) !== newSource) {
            void ensurePromptPilotModelsLoaded(newSource);
        }
    });
}
