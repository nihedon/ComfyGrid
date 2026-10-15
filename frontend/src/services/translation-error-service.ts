import { get } from 'svelte/store';
import { t } from '@/i18n/i18n';
import { appState } from '@/states/app-state.svelte';

export function notifyTranslationError(error: unknown, status?: number, model?: string) {
    const translate = get(t);
    let code = status === 504 ? 'timeout' : 'failed';
    let details = '';
    if (typeof error === 'string') {
        details = error.trim();
    } else if (Array.isArray(error)) {
        details = JSON.stringify(error, null, 2);
    } else if (error && typeof error === 'object') {
        if ('code' in error && typeof error.code === 'string') code = error.code;
        if ('details' in error && typeof error.details === 'string') details = error.details.trim();
        if ('name' in error) {
            code = error.name === 'TimeoutError' ? 'timeout' : 'network';
        }
    }
    const title = translate('translation.error.title');
    const reason = translate(`translation.error.${code}`) || translate('translation.error.failed');
    const summary = `${title}: ${reason}${status ? ` (HTTP ${status})` : ''}`;
    if (details) {
        appState.dialogState.showErrorDialog({
            title,
            message: [summary, model ? `Model: ${model}` : '', details].filter(Boolean).join('\n\n'),
            showOutsideGrid: true,
        });
    } else {
        appState.toastState.addToast({ type: 'error', message: summary });
    }
}
