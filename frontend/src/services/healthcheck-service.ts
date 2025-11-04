import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';

export class ComfyUIHealthCheckService {
    private ws: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private isClosing = false;

    connect() {
        if (this.ws !== null) return;
        this.isClosing = false;
        this.openWebSocket();
    }

    private openWebSocket() {
        if (this.isClosing) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/comfygrid/ws/startup-logs`;

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            appState.comfyUiState.isBackendConnected = true;
            logger.info('[HealthCheck] WebSocket connected');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'comfygrid.comfyui_status') {
                    if (data.started) {
                        appState.comfyUiState.started = true;
                    } else {
                        this.handleComfyUiStopped();
                    }
                }
            } catch (e) {
                logger.error('[HealthCheck] Failed to parse message:', e);
            }
        };

        this.ws.onerror = () => {
            appState.comfyUiState.isBackendConnected = false;
        };

        this.ws.onclose = () => {
            this.ws = null;
            appState.comfyUiState.isBackendConnected = false;
            if (!this.isClosing) {
                this.reconnectTimer = setTimeout(() => this.openWebSocket(), 3000);
            }
        };
    }

    private handleComfyUiStopped() {
        if (!appState.comfyUiState.started) return;
        appState.comfyUiState.started = false;
        appState.comfyUiState.graphReady = false;
        appState.executionState.clear();
        location.reload();
    }

    close() {
        this.isClosing = true;
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws !== null) {
            this.ws.close();
            this.ws = null;
        }
    }
}
