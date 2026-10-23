<script lang="ts">
  import { ArrowLeft, RotateCw } from '@lucide/svelte';
  import { retryComfyUiTransition } from '@/services/comfyui-lifecycle-service';
  import { appState } from '@/states/app-state.svelte';
  import StartupLogs from '../sections/StartupLogs.svelte';
  import AppLogo from './AppLogo.svelte';

  let { initializing } = $props<{ initializing: boolean }>();

  let comfyUiState = appState.comfyUiState;

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

<div id="loading-panel" class:has-transition-error={Boolean(transitionError)}>
  <div class="loading-focus">
    <AppLogo
      animated
      rotating={isWaitingForComfyUi || isStartingComfyGrid}
      muted={Boolean(transitionError)}
    />
    <div class="loading-status" role="status" aria-live="polite" aria-atomic="true">
      <span class="visually-hidden">{statusText}</span>
      {#key statusText}
        <span class="loading-text" aria-hidden="true">
          {#each Array.from(statusText ?? '') as letter, index (index)}<span
              class="loading-letter"
              style:animation-delay="{index * 24}ms">{letter === ' ' ? '\u00a0' : letter}</span
            >{/each}
        </span>
      {/key}
    </div>
    {#if transitionError}
      <div class="loading-error text-center">
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
  </div>
  {#if !comfyUiState.graphReady}
    <div class="loading-logs"><StartupLogs /></div>
  {/if}
</div>

<style lang="scss">
  #loading-panel {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: minmax(1rem, 1fr) auto minmax(1rem, 1fr);
    justify-items: center;
    gap: 2.5rem;
    padding: 1.5rem;
    overflow: auto;
    background: var(--bs-body-bg);
    color: var(--bs-body-color);
  }

  .loading-focus {
    grid-row: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.75rem;
    width: 100%;
    min-width: 0;
  }

  .loading-status {
    min-height: 2.5rem;
    font-size: 1.75rem;
    font-weight: 500;
    line-height: 1.4;
    text-align: center;
  }

  .loading-text {
    display: inline-block;
    white-space: nowrap;
  }

  .loading-letter {
    display: inline-block;
    /* Moving Letters-inspired reveal; see public/loading-animations.LICENSE.txt. */
    animation: letter-reveal 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .loading-error {
    width: 100%;
    max-width: 36rem;
  }

  .loading-logs {
    grid-row: 3;
    align-self: start;
    width: min(100%, 70rem);
    min-height: 0;
    max-height: 100%;
    overflow: auto;
  }

  .loading-logs :global(.startup-logs-container) {
    position: static;
    width: 100%;
    min-width: 0;
  }

  .loading-logs :global(.logs-content) {
    line-height: 1.5;
  }

  .loading-logs :global(.log-line) {
    color: var(--bs-secondary-color);
  }

  @keyframes letter-reveal {
    from {
      transform: translateY(0.65em);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-letter {
      animation: none;
    }
  }
</style>
