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

    get bridge() {
        return comfyUiState.bridge;
    }
    get isDebugMode() {
        return optionManager.getOptionValue('debug_mode');
    }

    get comfyUiState() {
        return comfyUiState;
    }
    get workspaceState() {
        return workspaceState;
    }
    get galleryState() {
        return galleryState;
    }
    get popoverState() {
        return popoverState;
    }
    get toastState() {
        return toastState;
    }
    get dialogState() {
        return dialogState;
    }
    get modalState() {
        return modalState;
    }
    get inpaintModalState() {
        return inpaintModalState;
    }
    get descriptionModalState() {
        return descriptionModalState;
    }
    get optionState() {
        return optionManager;
    }
    get executionState() {
        return executionState;
    }
    get jobState() {
        return jobState;
    }
    get storageState() {
        return storageState;
    }
    get uiState() {
        return uiState;
    }
    get systemState() {
        return systemState;
    }
}

export const appState = new AppState();
