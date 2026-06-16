import { debounce } from 'es-toolkit';
import { comfyGridApiClient } from '@/api/api-client';
import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';
import { callOptionsChangedCallbacks } from './callback-service';

let savePromise: Promise<void> | null = null;

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

function saveOpts(): Promise<void> {
    savePromise = comfyGridApiClient.postOpts(appState.optionState.opts).then(() => {});

    callOptionsChangedCallbacks();
    return savePromise;
}

const saveOptsDebounced = debounce(saveOpts, 1000);

export async function saveOptsWithCallback(callback?: () => void): Promise<void> {
    saveOptsDebounced();
    await savePromise;
    callback?.();
}
