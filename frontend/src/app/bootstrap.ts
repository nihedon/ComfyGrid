import { mount } from 'svelte';
import * as bootstrap from 'bootstrap';
import 'gridstack/dist/gridstack-all.js';
import jQuery from 'jquery';
import { loadRuntimeExtensions } from '@/components/widgets/comfyui/registry/runtime-loader';
import { setupCustomNodeApi } from '@/services/custom-node-service';
import { ComfyUIHealthCheckService } from '@/services/healthcheck-service';
import { appState } from '@/states/app-state.svelte';
import logger from '@/utils/logger';
import App from '../App.svelte';
import '../styles/app.scss';

globalThis.bootstrap = bootstrap;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).jQuery = jQuery;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).$ = jQuery;

await import('bootstrap-autocomplete');
await import('bootstrap-contextmenu');
const litHtml = await import('lit-html');
const litUnsafeHtml = await import('lit-html/directives/unsafe-html.js');
globalThis.litHtml = {
    ...litHtml,
    unsafeHTML: litUnsafeHtml.unsafeHTML,
};

globalThis.opts = {};
globalThis.forms = {};
globalThis.extForms = {};

const onChange = (e: MediaQueryListEvent) => {
    const currentTheme = appState.optionState.opts.get('color_theme');
    if (currentTheme === 'auto') {
        if (e.matches) {
            document.documentElement.dataset.bsTheme = 'dark';
        } else {
            delete document.documentElement.dataset.bsTheme;
        }
    }
};

const mediaQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', onChange);
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        logger.log('Disposing bootstrap theme listener');
        mediaQuery.removeEventListener('change', onChange);
    });
}

const comfyUiHealthCheck = new ComfyUIHealthCheckService();
comfyUiHealthCheck.connect();

setupCustomNodeApi();

loadRuntimeExtensions();

mount(App, {
    target: document.getElementById('comfygrid'),
});
