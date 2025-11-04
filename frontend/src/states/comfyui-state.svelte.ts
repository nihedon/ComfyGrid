import { ComfyUiApiHook } from '@/bridge/comfyui-api-hook';
import { ComfyUiEventListener } from '@/bridge/comfyui-event-listener';
import type { ComfyApi, ComfyApp } from '@/types/comfy-model';
import { ComfyUiBridge } from './comfyui-bridge.svelte';

export type ComfyWindow = Window & { comfyAPI: { app: { app: ComfyApp }; api: { api: ComfyApi } } };

class ComfyUiState {
    #started: boolean = $state(false);
    #isBackendConnected: boolean = $state(false);
    #graphReady: boolean = $state(false);
    #bridge: ComfyUiBridge = $state(null);
    #iframe: HTMLIFrameElement | null = $state(null);
    #window: ComfyWindow | null = $state(null);
    #stopHookInterval: (() => void) | null = null;

    readonly comfyAPI = $derived(this.#graphReady ? this.#window.comfyAPI : null);
    readonly app = $derived(this.comfyAPI ? this.comfyAPI.app.app : null);
    readonly api = $derived(this.comfyAPI ? this.comfyAPI.api.api : null);

    readonly bridge = $derived(this.#graphReady && this.app && this.api ? this.#bridge : null);

    get started() {
        return this.#started;
    }
    get isBackendConnected() {
        return this.#isBackendConnected;
    }
    get graphReady() {
        return this.#graphReady;
    }
    get iframe() {
        return this.#iframe;
    }
    get window() {
        return this.#window;
    }

    set started(started: boolean) {
        this.#started = started;
    }
    set isBackendConnected(isBackendConnected: boolean) {
        this.#isBackendConnected = isBackendConnected;
    }
    set graphReady(graphReady: boolean) {
        this.#graphReady = graphReady;
        if (graphReady) {
            this.#bridge = ComfyUiBridge.getInstance();
            ComfyUiEventListener.listen(this.api);
        }
    }
    set iframe(iframe: HTMLIFrameElement | null) {
        this.#iframe = iframe;
    }
    set window(window: ComfyWindow) {
        this.#stopHookInterval?.();
        this.#window = window;
        this.#stopHookInterval = ComfyUiApiHook.startHookLoadGraphDataInterval(window);
    }
}

export const comfyUiState = new ComfyUiState();
