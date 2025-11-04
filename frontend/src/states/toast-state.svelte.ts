type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message: string;
    timestamp: number;
}

class ToastState {
    #toasts = $state<Toast[]>([]);

    get toasts(): ReadonlyArray<Toast> {
        return this.#toasts;
    }

    addToast(data: { type: ToastType; message: string }) {
        const { type, message } = data;
        let title: string;
        switch (type) {
            case 'error':
                title = 'Error';
                break;
            case 'warning':
                title = 'Warning';
                break;
            default:
                title = 'Info';
                break;
        }
        const toast: Toast = {
            id: `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type,
            title,
            message,
            timestamp: Date.now(),
        };
        this.#toasts.push(toast);
    }

    removeToast(id: string) {
        this.#toasts = this.#toasts.filter((t) => t.id !== id);
    }

    clear() {
        this.#toasts = [];
    }
}

export const toastState = new ToastState();
