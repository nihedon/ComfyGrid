<script lang="ts">
  import { t } from '@/i18n/i18n';
  import { appState } from '@/states/app-state.svelte';
  import SelectablePopover from '../common/SelectablePopover.svelte';

  let jobListElement = $state<HTMLButtonElement>();
  let queueListElement = $state<HTMLDivElement>();

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

  function handleDeleteJob(jobId: string) {
    if (executionState.deleteQueueJobId(jobId)) {
      executionState.deleteQueue(jobId);
    }
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
    {#if executionState.queueJobIds.size > 1}
      <span
        class="top-0 start-100 d-flex align-items-center justify-content-center translate-middle badge rounded-pill bg-danger"
        style="position: absolute !important;"
      >
        {#if executionState.queueJobIds.size > 100}
          99+
        {:else}
          {executionState.queueJobIds.size - 1}
        {/if}
      </span>
    {/if}
  </button>

  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button
    type="button"
    class="btn btn-light btn-square position-relative d-flex justify-content-center align-items-center"
    bind:this={jobListElement}
    ><i class="pi pi-bars"></i>
  </button>

  <div class="d-none">
    <div class="list-group overflow-y-auto" bind:this={queueListElement} style="max-height: 250px;">
      {#if executionState.queueJobIds.size > 0}
        {#each executionState.queueJobIds as [jobId] (jobId)}
          <div
            class="list-group-item d-flex gap-2 align-items-center px-2 py-1 text-truncate flex-shrink-0"
            title={jobId}
          >
            <span class="vstack justify-content-center" style="min-width: 1.2rem;"
              >{#if executionState.lastProcessedJobId === jobId}<i
                  class="spinner-grow spinner-grow-sm"
                ></i>{/if}</span
            >
            <div class="vstack justify-content-center">
              <span>{jobId}</span>
              <div class="w-100 progress" style="height: 4px;" role="progressbar">
                {#if executionState.lastProcessedJobId === jobId}
                  <div class="progress-bar" style="width: {executionState.jobProgress}%"></div>
                {/if}
              </div>
            </div>
            <button
              class="btn btn-sm btn-danger"
              aria-label={$t('action.remove')}
              onclick={(e: Event) => {
                e.stopPropagation();
                handleDeleteJob(jobId);
              }}><i class="pi pi-times"></i></button
            >
          </div>
        {/each}
      {:else}
        <div class="p-2 text-muted small text-center">No jobs in queue</div>
      {/if}
    </div>
  </div>
  <SelectablePopover
    triggerElement={jobListElement}
    contentsElement={queueListElement}
    placement="left"
    customClass="job-list"
  ></SelectablePopover>
</div>

<style lang="scss">
  :global(.job-list) {
    --bs-popover-max-width: 500px !important;
    --bs-popover-body-padding-x: 0 !important;
    --bs-popover-body-padding-y: 0 !important;
  }

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
