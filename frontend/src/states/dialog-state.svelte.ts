import { appState } from './app-state.svelte';

export type DialogType = 'TypeInfo' | 'TypeError' | 'TypeFatal';

interface DialogData {
    type: DialogType;
    title: string;
    message: string;
    traceback: string[];
}

class DialogState {
    current = $state<DialogData | null>(null);

    showDialog(payload: { type: DialogType; title: string; message: string; traceback?: string[] }) {
        if (appState.uiState.activePageId !== 'grid') return;
        const { type, title, message, traceback } = payload;
        const errorType = type || 'TypeError';
        const errorTitle = title || 'Execution failed';
        const errorMessage = message || 'Execution failed';
        this.current = { type: errorType, title: errorTitle, message: errorMessage, traceback: traceback ?? [] };
    }

    showErrorDialog(payload: { title: string; message: string; traceback?: string[] }) {
        const { title, message, traceback } = payload;
        this.showDialog({ type: 'TypeError', title: title, message: message, traceback: traceback ?? [] });
    }

    showFatalDialog(payload: { title: string; message: string; traceback?: string[] }) {
        const { title, message, traceback } = payload;
        this.showDialog({ type: 'TypeFatal', title: title, message: message, traceback: traceback ?? [] });
    }

    close() {
        this.current = null;
    }
}

export const dialogState = new DialogState();
