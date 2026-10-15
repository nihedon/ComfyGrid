import { debounce } from 'es-toolkit';
import { comfyGridApiClient } from '@/api/api-client';
import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';
import { callOptionsChangedCallbacks } from './callback-service';

let savePromise = Promise.resolve();
let pendingSaves: { resolve: () => void; reject: (error: unknown) => void }[] = [];

export async function loadOpts() {
    try {
        const res = await comfyGridApiClient.getOpts();
        if (res.ok) {
            const data = res.json;
            globalThis.opts = { ...globalThis.opts, ...data.opts };
            globalThis.forms = { ...globalThis.forms, ...data.forms };
            globalThis.extForms = { ...globalThis.extForms, ...data.ext_forms };

            appState.optionState.opts = globalThis.opts;
            appState.optionState.forms = globalThis.forms;
            appState.optionState.extForms = globalThis.extForms;

            saveOptsWithCallback();
        }
    } catch (error) {
        logger.error('Failed to fetch opts:', error);
    }
}

function saveOpts(): void {
    const waiting = pendingSaves;
    pendingSaves = [];
    const opts = new Map(appState.optionState.opts);

    // Serialize batches so an older request cannot overwrite newer settings.
    savePromise = savePromise.then(async () => {
        try {
            const res = await comfyGridApiClient.postOpts(opts);
            if (!res.ok) throw new Error(`Failed to save opts: ${res.status}`);
            callOptionsChangedCallbacks();
            waiting.forEach(({ resolve }) => resolve());
        } catch (error) {
            waiting.forEach(({ reject }) => reject(error));
        }
    });
}

const saveOptsDebounced = debounce(saveOpts, 1000);

export function saveOptsWithCallback(callback?: () => void): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
        pendingSaves.push({ resolve, reject });
    }).then(() => callback?.());
    // Existing UI callers may intentionally save without awaiting the result.
    void promise.catch((error) => logger.error('Failed to save opts:', error));
    saveOptsDebounced();
    return promise;
}
