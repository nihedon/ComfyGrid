import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';
import { updateComfyUiConnection } from './comfyui-lifecycle-service';

export class ComfyUIHealthCheckService {
    private ws: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private isClosing = false;

    connect() {
        if (this.ws !== null || this.reconnectTimer !== null) return;
        this.isClosing = false;
        this.openWebSocket();
    }

    private openWebSocket() {
        if (this.isClosing) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/comfygrid/ws/startup-logs`;

        const socket = new WebSocket(url);
        this.ws = socket;

        socket.onopen = () => {
            if (this.ws !== socket || this.isClosing) return;
            appState.comfyUiState.isBackendConnected = true;
            logger.info('[HealthCheck] WebSocket connected');
        };

        socket.onmessage = (event) => {
            if (this.ws !== socket || this.isClosing) return;
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'comfygrid.comfyui_status' && typeof data.started === 'boolean') {
                    updateComfyUiConnection(data.started);
                }
            } catch (e) {
                logger.error('[HealthCheck] Failed to parse message:', e);
            }
        };

        socket.onerror = () => {
            if (this.ws !== socket || this.isClosing) return;
            appState.comfyUiState.isBackendConnected = false;
        };

        socket.onclose = () => {
            if (this.ws !== socket) return;
            this.ws = null;
            appState.comfyUiState.isBackendConnected = false;
            if (!this.isClosing) {
                this.reconnectTimer = setTimeout(() => {
                    this.reconnectTimer = null;
                    this.openWebSocket();
                }, 3000);
            }
        };
    }

    close() {
        this.isClosing = true;
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws !== null) {
            const socket = this.ws;
            this.ws = null;
            socket.close();
        }
        appState.comfyUiState.isBackendConnected = false;
    }
}
