import { get } from 'svelte/store';
import { comfyGridApiClient } from '@/api/api-client';
import { t } from '@/i18n/i18n';
import { executionManager } from '@/managers/execution-manager';
import { workflowManager } from '@/managers/workflow-manager';
import { appState } from '@/states/app-state.svelte';
import type { ComfyApp } from '@/types/comfy-model';
import logger from '@/utils/logger';

const state = appState.comfyUiState;
const TRANSITION_TIMEOUT_MS = 300_000;
const STARTUP_IDLE_TIMEOUT_MS = 60_000;
let downloading = false;
let synchronizing = false;
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let previousApp: ComfyApp | null = null;
let previousGraphReady = false;
let previousFrameVersion = 0;
let restoringApp: ComfyApp | null = null;
let synchronizedApp: ComfyApp | null = null;

function currentApp(): ComfyApp | null {
    return state.window?.comfyAPI?.app?.app ?? null;
}

function armTimeout() {
    clearTimeout(timer);
    if (!state.transition || state.transitionError || (!synchronizing && downloading)) return;
    const token = generation;
    timer = setTimeout(() => fail(token, 'log.comfyui.lifecycle.timeout'), synchronizing ? TRANSITION_TIMEOUT_MS : STARTUP_IDLE_TIMEOUT_MS);
}

export function notifyComfyUiStartupLog() {
    if (!synchronizing) armTimeout();
}

export function updateComfyUiDownload(active: boolean) {
    downloading = active;
    if (!synchronizing) armTimeout();
}

function fail(token: number, error: string) {
    if (token !== generation || !state.transition) return;
    clearTimeout(timer);
    state.transitionError = error;
    logger.error('ComfyUI transition failed:', error);
    // Only restore the old view if its connection and document are still valid.
    if (previousGraphReady && state.started && previousApp && previousApp === currentApp() && previousFrameVersion === state.frameReloadVersion) {
        previousApp = null;
        previousGraphReady = false;
        state.graphReady = true;
        state.transition = null;
        const translate = get(t);
        const reason = translate(error) || error;
        appState.toastState.addToast({
            type: 'error',
            message: translate('toast.comfyui_transition_failed', { reason }, `ComfyUI operation failed: ${reason}`),
        });
    }
}

function begin(kind: NonNullable<typeof state.transition>): number {
    const token = ++generation;
    clearTimeout(timer);
    previousApp = currentApp();
    previousGraphReady = state.graphReady;
    previousFrameVersion = state.frameReloadVersion;
    state.transition = kind;
    state.transitionError = '';
    state.graphReady = false;
    synchronizing = false;
    armTimeout();
    return token;
}

export function cancelComfyUiTransition() {
    ++generation;
    clearTimeout(timer);
    previousApp = null;
    previousGraphReady = false;
    restoringApp = null;
    synchronizedApp = null;
    synchronizing = false;
    downloading = false;
    state.transition = null;
    state.transitionError = '';
}

export function reloadComfyUi() {
    if (state.transition && !state.transitionError) return;
    begin(state.started ? 'reload' : 'reconnect');
    if (state.started) state.frameReloadVersion++;
}

export async function restartComfyUi() {
    if (state.transition && !state.transitionError) return;
    const token = begin('restart');
    try {
        const response = await comfyGridApiClient.postRestart();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
        fail(token, error instanceof Error ? error.message : String(error));
    }
}

export function retryComfyUiTransition() {
    if (state.transition === 'restart') void restartComfyUi();
    else reloadComfyUi();
}

export function updateComfyUiConnection(started: boolean) {
    const wasStarted = state.started;
    state.started = started;
    if (!started) {
        if (!wasStarted) return;
        appState.executionState.clearQueueJobIds();
        if (!state.transition) begin('reconnect');
        previousGraphReady = false;
        state.graphReady = false;
    } else if (!wasStarted && currentApp()) {
        if (!state.transition) begin('reconnect');
        state.frameReloadVersion++;
    }
}

export async function handleComfyUiGraphReady(app: ComfyApp) {
    // Ignore events from the document being replaced and duplicate hook/onload notifications.
    if (!state.started || !app || app !== currentApp() || app === previousApp || app === restoringApp) return;
    const token = state.transition ? generation : begin('loading');
    const frameVersion = state.frameReloadVersion;
    const isCurrent = () => state.started && token === generation && frameVersion === state.frameReloadVersion && app === currentApp();
    restoringApp = app;
    synchronizing = true;
    armTimeout();
    state.graphReady = true;
    try {
        if (synchronizedApp !== app) {
            await executionManager.syncStateFromComfyUi();
            if (!isCurrent()) return;
            synchronizedApp = app;
        }
        if (!isCurrent()) return;
        if (appState.uiState.activePageId === 'grid') await workflowManager.loadCurrentWorkflow();
        else appState.uiState.needRefresh = true;
        if (!isCurrent()) return;
        clearTimeout(timer);
        previousApp = null;
        state.transitionError = '';
        state.transition = null;
        synchronizing = false;
    } catch (error) {
        if (isCurrent()) fail(token, error instanceof Error ? error.message : String(error));
    } finally {
        if (restoringApp === app) restoringApp = null;
    }
}
