<script lang="ts">
  import { ArrowLeft, RotateCw } from '@lucide/svelte';
  import { retryComfyUiTransition } from '@/services/comfyui-lifecycle-service';
  import { appState } from '@/states/app-state.svelte';
  import StartupLogs from '../sections/StartupLogs.svelte';

  let { initializing } = $props<{ initializing: boolean }>();

  let comfyUiState = appState.comfyUiState;

  const spinnerStyle = $derived.by(() => {
    if (!comfyUiState.graphReady) {
      return 'spinner-grow text-body-tertiary';
    } else {
      return 'spinner-border text-primary';
    }
  });

  const isStartingComfyUi = $derived(!comfyUiState.graphReady && initializing);
  const isWaitingForComfyUi = $derived(!comfyUiState.graphReady && !initializing);
  const isStartingComfyGrid = $derived(comfyUiState.graphReady);
  const transitionError = $derived(
    comfyUiState.transitionError === 'log.comfyui.lifecycle.timeout'
      ? 'ComfyUI did not finish loading in time. Check the startup logs or retry.'
      : comfyUiState.transitionError,
  );

  const statusText = $derived.by(() => {
    if (isStartingComfyUi) {
      return 'Starting ComfyUI...';
    } else if (isWaitingForComfyUi) {
      return 'Waiting for ComfyUI...';
    } else if (isStartingComfyGrid) {
      return 'Starting ComfyGrid...';
    }
  });
</script>

<div
  id="loading-panel"
  class="position-fixed w-100 h-100 d-flex flex-column gap-3 justify-content-center align-items-center"
  class:has-transition-error={Boolean(transitionError)}
>
  <div class="d-flex gap-3 align-items-center">
    <div class={spinnerStyle} role="status"></div>
    <span class="fs-2 fw-bold text-body-tertiary">{statusText}</span>
  </div>
  {#if transitionError}
    <div class="text-center px-3" style="max-width: 36rem;">
      <div class="text-danger text-break" role="alert">{transitionError}</div>
      <div class="d-flex flex-wrap justify-content-center gap-2 mt-3">
        <button
          type="button"
          class="btn btn-primary d-flex align-items-center gap-2"
          onclick={retryComfyUiTransition}
        >
          <RotateCw size={16} />Retry
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary d-flex align-items-center gap-2"
          onclick={() => window.dispatchEvent(new CustomEvent('comfygrid:open_setup'))}
        >
          <ArrowLeft size={16} />Back to Setup
        </button>
      </div>
    </div>
  {/if}
  {#if !comfyUiState.graphReady}
    <StartupLogs />
  {/if}
</div>

<style lang="scss">
  #loading-panel {
    display: flex !important;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }

  .has-transition-error :global(.startup-logs-container) {
    position: static;
    min-width: 0;
  }
</style>
