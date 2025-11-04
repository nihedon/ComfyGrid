import { debounce } from 'es-toolkit';
import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';
import { callOptionsChangedCallbacks } from './callback-service';

let savePromise: Promise<void> | null = null;

export async function loadOpts() {
    try {
        const resp = await fetch('/comfygrid/api/opts');
        if (!resp.ok) {
            throw new Error(`HTTP error! status: ${resp.status}`);
        }
        const res = await resp.json();
        globalThis.opts = { ...globalThis.opts, ...res.opts };
        globalThis.forms = { ...globalThis.forms, ...res.forms };
        globalThis.extForms = { ...globalThis.extForms, ...res.ext_forms };

        appState.optionState.opts = globalThis.opts;
        appState.optionState.forms = globalThis.forms;
        appState.optionState.extForms = globalThis.extForms;

        saveOptsWithCallback();
    } catch (error) {
        logger.error('Failed to fetch opts:', error);
    }
}

function saveOpts(): Promise<void> {
    savePromise = fetch('/comfygrid/api/opts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(appState.optionState.opts)),
    }).then(() => {});

    callOptionsChangedCallbacks();
    return savePromise;
}

const saveOptsDebounced = debounce(saveOpts, 1000);

export async function saveOptsWithCallback(callback?: () => void): Promise<void> {
    saveOptsDebounced();
    await savePromise;
    callback?.();
}
