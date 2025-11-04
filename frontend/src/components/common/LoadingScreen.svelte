<script lang="ts">
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
>
  <div class="d-flex gap-3 align-items-center">
    <div class={spinnerStyle} role="status"></div>
    <span class="fs-2 fw-bold text-body-tertiary">{statusText}</span>
  </div>
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
</style>
