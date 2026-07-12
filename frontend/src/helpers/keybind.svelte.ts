import { galleryManager } from '@/managers/gallery-manager';
import { openLayout } from '@/services/gridstack-service';
import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';

function handleKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey) {
        if (e.key === 'Enter') {
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
