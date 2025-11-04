<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyWindow } from '@/states/comfyui-state.svelte';

  let iframeRef: HTMLIFrameElement;

  const uiState = appState.uiState;
  const comfyUiState = appState.comfyUiState;

  function injectBridge() {
    const iframeDoc = iframeRef.contentDocument || iframeRef.contentWindow?.document;
    if (!iframeDoc) return;

    comfyUiState.iframe = iframeRef;
    comfyUiState.window = iframeRef.contentWindow as ComfyWindow;
  }
</script>

<div
  id="comfyui-page"
  class="position-aboslute w-100 h-100 top-0 start-0"
  class:active={uiState.activePageId === 'comfyui'}
>
  <iframe
    class="w-100 h-100 d-block"
    title="ComfyUI"
    onload={() => {
      if (comfyUiState.started) {
        injectBridge();
      }
    }}
    src={comfyUiState.started ? '/' : 'about:blank'}
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
