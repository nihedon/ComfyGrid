import type { Version } from '@/types/verion';
import { comfyUiState } from './comfyui-state.svelte';
import { dialogState } from './dialog-state.svelte';
import { executionState } from './execution-state.svelte';
import { galleryState } from './gallery-state.svelte';
import { jobState } from './job-state.svelte';
import { descriptionModalState, inpaintModalState, modalState } from './modal-state.svelte';
import { optionManager } from './option-state.svelte';
import { popoverState } from './popover-state.svelte';
import { storageState } from './storage-state.svelte';
import { systemState } from './system-state.svelte';
import { toastState } from './toast-state.svelte';
import { uiState } from './ui-state.svelte';
import { workspaceState } from './workspace-state.svelte';

class AppState {
    name: string = $state('ComfyGrid');
    version: Version = $state({ branch: 'unknown', commit: 'unknown', tag: 'unknown', date: 'unknown', comitter: 'unknown' });

    readonly #comfyUiState = comfyUiState;
    readonly #workspaceState = workspaceState;
    readonly #galleryState = galleryState;
    readonly #popoverState = popoverState;
    readonly #toastState = toastState;
    readonly #dialogState = dialogState;
    readonly #modalState = modalState;
    readonly #inpaintModalState = inpaintModalState;
    readonly #descriptionModalState = descriptionModalState;
    readonly #optionState = optionManager;
    readonly #executionState = executionState;
    readonly #jobState = jobState;
    readonly #storageState = storageState;
    readonly #uiState = uiState;
    readonly #systemState = systemState;

    readonly bridge = $derived(comfyUiState.bridge);
    readonly isDebugMode = $derived(optionManager.getOptionValue('debug_mode'));

    get comfyUiState() {
        return this.#comfyUiState;
    }
    get workspaceState() {
        return this.#workspaceState;
    }
    get galleryState() {
        return this.#galleryState;
    }
    get popoverState() {
        return this.#popoverState;
    }
    get toastState() {
        return this.#toastState;
    }
    get dialogState() {
        return this.#dialogState;
    }
    get modalState() {
        return this.#modalState;
    }
    get inpaintModalState() {
        return this.#inpaintModalState;
    }
    get descriptionModalState() {
        return this.#descriptionModalState;
    }
    get optionState() {
        return this.#optionState;
    }
    get executionState() {
        return this.#executionState;
    }
    get jobState() {
        return this.#jobState;
    }
    get storageState() {
        return this.#storageState;
    }
    get uiState() {
        return this.#uiState;
    }
    get systemState() {
        return this.#systemState;
    }
}

export const appState = new AppState();
