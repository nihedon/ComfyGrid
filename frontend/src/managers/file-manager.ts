import { get } from 'svelte/store';
import { comfyGridApiClient } from '@/api/api-client';
import { t } from '@/i18n/i18n';
import { workflowManager } from '@/managers/workflow-manager';
import { importLayout } from '@/services/gridstack-service';
import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';

class FileManager {
    isValidDragData(e: DragEvent): boolean {
        const types = e.dataTransfer?.types || [];
        return types.includes('Files') || types.includes('text/html');
    }

    async handleDrop(e: DragEvent): Promise<void> {
        appState.uiState.isDragging = false;
        if (!this.isValidDragData(e)) {
            return;
        }
        e.preventDefault();

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) {
            return;
        }

        const file = files[0];
        await this.processFile(file);
    }

    async processFile(file: File): Promise<void> {
        const toastState = appState.toastState;
        const fileName = file.name.toLowerCase();

        if (/\.(json|txt)$/i.test(fileName)) {
            try {
                const text = await file.text();
                const json = JSON.parse(text);
                const keySize = Object.keys(json).length;

                if (keySize === 0) {
                    toastState.addToast({ type: 'error', message: get(t)('toast.metadata_load_failed') });
                    return;
                }

                let workflowLoaded = false;
                if (keySize > 1) {
                    workflowLoaded = await this.loadWorkflow(file.name, json);
                }

                if (json.comfygrid) {
                    await importLayout(JSON.stringify(json.comfygrid));
                    toastState.addToast({ type: 'success', message: get(t)('toast.layout_applied') });
                } else if (workflowLoaded) {
                    toastState.addToast({ type: 'info', message: get(t)('toast.no_layout_found') });
                } else {
                    toastState.addToast({ type: 'warning', message: get(t)('toast.no_workflow_found') });
                }
            } catch (error) {
                logger.error('Failed to read JSON file:', error);
                toastState.addToast({ type: 'error', message: get(t)('toast.metadata_load_failed') });
            }
            return;
        }

        if (!/\.(png|jfif|pjpeg|jpeg|pjp|jpg|webp|mp4|webm|m4v|mkv)$/i.test(fileName)) {
            toastState.addToast({ type: 'warning', message: get(t)('toast.unsupported_file_type') });
            return;
        }

        try {
            const res = await comfyGridApiClient.postImageInfo(file);
            if (!res.ok || !res.json) {
                toastState.addToast({ type: 'warning', message: get(t)('toast.no_workflow_found') });
                return;
            }

            const metadata = res.json;
            let workflowLoaded = false;

            if (metadata.workflow) {
                try {
                    const workflowJson = typeof metadata.workflow === 'string' ? JSON.parse(metadata.workflow) : metadata.workflow;
                    workflowLoaded = await this.loadWorkflow(file.name, workflowJson as Record<string, unknown>);
                } catch (e) {
                    logger.error('Failed to parse workflow from image metadata:', e);
                }
            }

            const comfygridData = metadata.comfygrid;
            if (comfygridData) {
                const layoutStr = typeof comfygridData === 'string' ? comfygridData : JSON.stringify(comfygridData);
                await importLayout(layoutStr);
                toastState.addToast({ type: 'success', message: get(t)('toast.layout_applied') });
            } else if (workflowLoaded) {
                toastState.addToast({ type: 'info', message: get(t)('toast.no_layout_found') });
            } else {
                toastState.addToast({ type: 'error', message: get(t)('toast.metadata_load_failed') });
            }
        } catch (error) {
            logger.error('Failed to process image file metadata:', error);
            toastState.addToast({ type: 'error', message: get(t)('toast.metadata_load_failed') });
        }
    }

    async loadWorkflow(fileName: string, workflowJson: Record<string, unknown>): Promise<boolean> {
        const toastState = appState.toastState;
        const ret = await appState.bridge?.loadWorkflow({
            filename: fileName,
            json: workflowJson,
        });

        if (ret?.success) {
            logger.log('Workflow applied successfully');
            toastState.addToast({ type: 'success', message: get(t)('toast.workflow_applied') });
            const res = await appState.bridge?.getWorkflow();
            if (res) {
                await workflowManager.handleWorkflow(res);
            }
            return true;
        } else {
            logger.error('Failed to apply workflow:', ret?.error);
            toastState.addToast({ type: 'error', message: get(t)('toast.workflow_apply_failed') });
            return false;
        }
    }
}

export const fileManager = new FileManager();
