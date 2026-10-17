import { get } from 'svelte/store';
import { comfyGridApiClient } from '@/api/api-client';
import { t } from '@/i18n/i18n';
import { fileManager } from '@/managers/file-manager';
import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';

type PasteContent = { kind: 'image'; file: File } | { kind: 'json'; text: string } | { kind: 'url'; url: string };
let importing = false;

function isEditing(event: ClipboardEvent): boolean {
    return [...event.composedPath(), document.activeElement].some(
        (target) => target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"], .cm-editor')),
    );
}

function readContent(data: DataTransfer): PasteContent | null {
    for (const item of Array.from(data.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) return { kind: 'image', file };
        }
    }
    const text = (data.getData('text/plain') || data.getData('text/uri-list')).trim();
    if (!text) return null;
    try {
        const url = new URL(text);
        if (url.protocol === 'http:' || url.protocol === 'https:') return { kind: 'url', url: url.href };
    } catch {
        /* Try JSON instead. */
    }
    try {
        const json: unknown = JSON.parse(text);
        if (json && typeof json === 'object' && !Array.isArray(json)) return { kind: 'json', text };
    } catch {
        /* Ordinary text must not trigger workflow import. */
    }
    return null;
}

export async function handleWorkflowPaste(event: ClipboardEvent): Promise<void> {
    if (event.defaultPrevented || !event.clipboardData || isEditing(event)) return;
    const state = appState.comfyUiState;
    if (!state.graphReady || state.transition || !appState.bridge) return;
    const content = readContent(event.clipboardData);
    if (!content) return;
    event.preventDefault();
    if (importing) return;
    importing = true;
    const sourceApp = state.app;
    try {
        if (!confirm(get(t)('workflow.paste.confirm'))) return;
        if (content.kind === 'url') {
            const response = await comfyGridApiClient.fetchWorkflowUrl(content.url);
            if (!response.ok || !response.file) {
                appState.toastState.addToast({ type: 'error', message: get(t)('toast.workflow_url_load_failed') });
                return;
            }
            if (state.graphReady && !state.transition && state.app === sourceApp) await fileManager.processFile(response.file);
        } else if (content.kind === 'json') {
            await fileManager.processTextFile(new File([content.text], 'workflow.json', { type: 'application/json' }));
        } else {
            const file = content.file;
            const suffix = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/jxl': '.jxl' }[file.type];
            const image = suffix && !file.name.toLowerCase().endsWith(suffix) ? new File([file], `clipboard${suffix}`, { type: file.type }) : file;
            await fileManager.processMediaFile(image);
        }
    } catch (error) {
        logger.error('Failed to import pasted workflow:', error);
        appState.toastState.addToast({ type: 'error', message: get(t)('toast.metadata_load_failed') });
    } finally {
        importing = false;
    }
}
