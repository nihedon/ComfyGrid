import { get } from 'svelte/store';
import { t } from '@/i18n/i18n';
import { galleryManager } from '@/managers/gallery-manager';
import { openLayout } from '@/services/gridstack-service';
import { appState } from '@/states/app-state.svelte';
import { workflowState } from '@/states/workflow-state.svelte';
import logger from '@/utils/logger';

let savingWorkflow = false;

async function saveCurrentWorkflow() {
    const bridge = appState.bridge;
    const sourceApp = appState.comfyUiState.app;
    if (!bridge || !sourceApp || appState.comfyUiState.transition || savingWorkflow) return;
    savingWorkflow = true;
    try {
        const saved = await bridge.saveWorkflow((name) => prompt(get(t)('workflow.save.filename'), name));
        if (!saved || appState.comfyUiState.app !== sourceApp) return;
        if (saved.selected) appState.name = saved.name;
        const targetPath = saved.path.startsWith('workflows/') ? saved.path.slice('workflows/'.length) : null;
        const thumbnailSaved = targetPath !== null && (await workflowState.saveCapturedThumbnail(targetPath, saved.capture));
        if (appState.comfyUiState.app !== sourceApp) return;
        appState.toastState.addToast({
            type: thumbnailSaved ? 'success' : 'warning',
            message: get(t)(thumbnailSaved ? 'toast.workflow_saved' : 'toast.workflow_thumbnail_save_failed'),
        });
        if (appState.uiState.activePageId === 'files') {
            void workflowState.fetchWorkflows().catch((error) => logger.error('Failed to refresh workflows after saving:', error));
        }
    } catch (error) {
        if (appState.comfyUiState.app !== sourceApp) return;
        const reason = error instanceof Error ? error.message : String(error);
        logger.error('Failed to save ComfyUI workflow:', error);
        appState.toastState.addToast({ type: 'error', message: get(t)('toast.workflow_save_failed', { reason }) });
    } finally {
        savingWorkflow = false;
    }
}

function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey && e.key.toLowerCase() === 's') {
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (!e.repeat) void saveCurrentWorkflow();
        return;
    }
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') {
            e.preventDefault();
            appState.executionState.execute();
        }
    }
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
            const currentGalleryJob = appState.galleryState.currentGalleryJob;
            if (currentGalleryJob) {
                e.preventDefault();

                const metadata = currentGalleryJob.metadata ?? {};
                galleryManager.saveImage(metadata);
            }
        } else if (e.key === 'o') {
            e.preventDefault();
            openLayout();
        }
    }
}

export function bindKeyboardShortcuts() {
    globalThis.removeEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('keydown', handleKeyDown);

    if (import.meta.hot) {
        import.meta.hot.dispose(() => {
            logger.log('Disposing key-bind.ts');
            globalThis.removeEventListener('keydown', handleKeyDown);
        });
    }
}
