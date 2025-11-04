<script lang="ts">
  import { t } from '@/i18n/i18n';
  import { appState } from '@/states/app-state.svelte';

  const executionState = appState.executionState;

  function handleChangeBatchCount(e: Event) {
    let batchCount = Number((e.target as HTMLInputElement).value);
    if (batchCount < 1) {
      batchCount = 1;
    }
    executionState.batchCount = batchCount;
  }

  function handleExecute() {
    executionState.execute();
  }

  function handleCancel() {
    executionState.interrupt();
  }

  function handleClearQueue() {
    executionState.clearQueue();
  }
</script>

<div class="d-flex align-items-center column-gap-2">
  <div class="input-group d-flex flex-nowrap align-items-center">
    <button
      type="button"
      class="btn btn-primary btn-exec text-nowrap"
      title={$t('action.execute')}
      onclick={handleExecute}><i class="pi pi-caret-right pe-1"></i>{$t('action.execute')}</button
    >
    <input
      type="number"
      class="form-control batch-counter action"
      min="1"
      max="100"
      value={executionState.batchCount}
      onchange={handleChangeBatchCount}
    />
  </div>

  <button
    type="button"
    class="btn btn-danger btn-square d-flex justify-content-center align-items-center"
    title={$t('action.cancel')}
    onclick={handleCancel}><i class="pi pi-times"></i></button
  >

  <button
    type="button"
    class="btn btn-light btn-square position-relative d-flex justify-content-center align-items-center"
    title={$t('action.clear')}
    onclick={handleClearQueue}
    ><i class="pi pi-stop"></i>
    {#if executionState.queueCount > 1}
      <span
        class="top-0 start-100 d-flex align-items-center justify-content-center translate-middle badge rounded-pill bg-danger"
        style="position: absolute !important;"
      >
        {#if executionState.queueCount > 100}
          99+
        {:else}
          {executionState.queueCount - 1}
        {/if}
      </span>
    {/if}
  </button>
</div>

<style lang="scss">
  .btn-exec {
    width: 9rem !important;
    height: 2.2rem !important;
    padding: 0 !important;
  }

  .batch-counter {
    width: 5rem !important;
    height: 2.2rem !important;
    padding: 0 0 0 1rem !important;
  }

  .btn-square {
    width: 2.2rem !important;
    height: 2.2rem !important;
    padding: 1rem !important;
  }

  .badge {
    width: 1.3rem !important;
    height: 1.3rem !important;
    padding: 0 !important;
    font-weight: bold !important;
  }
</style>
