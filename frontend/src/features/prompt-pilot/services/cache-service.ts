import type { ResponseData } from '../types';

const DB_NAME = 'comfygrid_prompt_pilot';
const STORE_NAME = 'tag_dictionaries';
const DB_VERSION = 1;
const CACHE_SCHEMA_VERSION = 2;

export interface CachedDictionaryRecord {
    source: string;
    data: ResponseData;
    etag?: string;
    lastModified?: string;
    contentLength?: string;
    savedAt: number;
    schemaVersion: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDB(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'source' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = (err) => {
                console.warn('[PromptPilot] IndexedDB open error:', err);
                resolve(null);
            };
        } catch (e) {
            console.warn('[PromptPilot] IndexedDB not available:', e);
            resolve(null);
        }
    });

    return dbPromise;
}

export async function getCachedDictionary(source: string): Promise<CachedDictionaryRecord | null> {
    try {
        const db = await getDB();
        if (!db) return null;

        return await new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(source);

            request.onsuccess = () => {
                const record = request.result as CachedDictionaryRecord | undefined;
                if (record && record.schemaVersion === CACHE_SCHEMA_VERSION && record.data) {
                    resolve(record);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

export async function setCachedDictionary(source: string, data: ResponseData, etag?: string, lastModified?: string, contentLength?: string): Promise<void> {
    try {
        const db = await getDB();
        if (!db) return;

        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const record: CachedDictionaryRecord = {
                source,
                data,
                etag,
                lastModified,
                contentLength,
                savedAt: Date.now(),
                schemaVersion: CACHE_SCHEMA_VERSION,
            };
            const request = store.put(record);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.warn(`[PromptPilot] Failed to cache dictionary ${source}:`, e);
    }
}
