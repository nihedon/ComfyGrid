import { mount } from 'svelte';
import * as bootstrap from 'bootstrap';
import 'gridstack/dist/gridstack-all.js';
import jQuery from 'jquery';
import { ensurePromptPilotModelsLoaded } from '@/components/common/prompt-editor/prompt-pilot/services/loader-service';
import { loadRuntimeExtensions } from '@/components/widgets/comfyui/registry/runtime-loader';
import { setupCustomNodeApi } from '@/services/custom-node-service.svelte';
import { ComfyUIHealthCheckService } from '@/services/healthcheck-service';
import App from '../App.svelte';
import '../styles/app.scss';

globalThis.bootstrap = bootstrap;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).jQuery = jQuery;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).$ = jQuery;

await import('bootstrap-autocomplete');
const litHtml = await import('lit-html');
const litUnsafeHtml = await import('lit-html/directives/unsafe-html.js');
globalThis.litHtml = {
    ...litHtml,
    unsafeHTML: litUnsafeHtml.unsafeHTML,
};

globalThis.opts = {};
globalThis.forms = {};
globalThis.extForms = {};

const comfyUiHealthCheck = new ComfyUIHealthCheckService();
comfyUiHealthCheck.connect();
if (import.meta.hot) {
    import.meta.hot.dispose(() => comfyUiHealthCheck.close());
}

setupCustomNodeApi();

loadRuntimeExtensions();

// Preload PromptPilot tag dictionaries on page open
void ensurePromptPilotModelsLoaded();

mount(App, {
    target: document.getElementById('comfygrid'),
});
