<script lang="ts">
  import { onDestroy } from 'svelte';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyWindow } from '@/states/comfyui-state.svelte';

  let iframeRef = $state<HTMLIFrameElement>();
  let registeredFrame: HTMLIFrameElement | undefined;
  let destroyed = false;

  const uiState = appState.uiState;
  const comfyUiState = appState.comfyUiState;
  let frameStarted = $state(false);
  let lastReloadVersion = comfyUiState.frameReloadVersion;

  $effect(() => {
    if (comfyUiState.started) frameStarted = true;
  });

  $effect(() => {
    if (!iframeRef) return;
    registeredFrame = iframeRef;
    comfyUiState.iframe = iframeRef;
    comfyUiState.window = iframeRef.contentWindow as ComfyWindow;
  });

  $effect(() => {
    const version = comfyUiState.frameReloadVersion;
    if (version === lastReloadVersion) return;
    lastReloadVersion = version;
    if (iframeRef && frameStarted) iframeRef.src = '/';
  });

  onDestroy(() => {
    destroyed = true;
    if (registeredFrame && comfyUiState.iframe === registeredFrame) {
      comfyUiState.iframe = null;
      comfyUiState.window = null;
    }
  });

  function injectBridge(frame: HTMLIFrameElement) {
    if (destroyed || !comfyUiState.started || (iframeRef && iframeRef !== frame)) return;
    const iframeDoc = frame.contentDocument || frame.contentWindow?.document;
    if (!iframeDoc) return;

    registeredFrame = frame;
    comfyUiState.iframe = frame;
    comfyUiState.window = frame.contentWindow as ComfyWindow;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = comfyUiState.window?.comfyAPI?.app?.app as any;
    if (app?.graph?._nodes?.length > 0 && !comfyUiState.graphReady) {
      window.dispatchEvent(new CustomEvent('comfygrid:graph_ready', { detail: { app } }));
    }
  }
</script>

<div
  id="comfyui-page"
  class="position-absolute w-100 h-100 top-0 start-0"
  class:active={uiState.activePageId === 'comfyui'}
>
  <iframe
    class="w-100 h-100 d-block"
    title="ComfyUI"
    onload={(event) => injectBridge(event.currentTarget as HTMLIFrameElement)}
    src={frameStarted ? '/' : 'about:blank'}
    bind:this={iframeRef}
  ></iframe>
</div>

<style lang="scss">
  #comfyui-page:not(.active) {
    position: absolute;
    opacity: 0.001;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }
</style>
