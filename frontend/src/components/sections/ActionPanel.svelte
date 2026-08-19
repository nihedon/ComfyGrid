<script lang="ts">
  import { IconList, IconPlayerPlay, IconPlayerStop, IconX } from '@tabler/icons-svelte';
  import { t } from '@/i18n/i18n';
  import { translationManager } from '@/services/translation-service.svelte';
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
    if (executionState.processingJobId === jobId) {
      handleCancel();
    } else if (executionState.deleteQueueJobId(jobId)) {
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
      class="btn btn-primary btn-exec text-nowrap d-flex justify-content-center align-items-center position-relative"
      title={$t('action.execute')}
      onclick={handleExecute}
    >
      <IconPlayerPlay size={18} class="pe-1" />{$t('action.execute')}
      {#if translationManager.pendingQueueCount > 0}
        <span
          class="top-0 start-100 d-flex align-items-center justify-content-center translate-middle badge rounded-pill bg-danger"
          style="position: absolute !important;"
        >
          {#if translationManager.pendingQueueCount > 99}
            99+
          {:else}
            {translationManager.pendingQueueCount}
          {/if}
        </span>
      {/if}
    </button>
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
    class="btn btn-danger btn-square d-flex justify-content-center align-items-center p-0"
    title={$t('action.cancel')}
    onclick={handleCancel}><IconX size={18} /></button
  >

  <button
    type="button"
    class="btn btn-light btn-square position-relative d-flex justify-content-center align-items-center"
    title={$t('action.clear')}
    onclick={handleClearQueue}
    ><IconPlayerStop size={18} />
  </button>

  <button
    type="button"
    class="btn btn-light btn-square position-relative d-flex justify-content-center align-items-center"
    bind:this={jobListElement}
    ><IconList size={18} />
    {#if executionState.queueJobIds.size > 0}
      <span
        class="top-0 start-100 d-flex align-items-center justify-content-center translate-middle badge rounded-pill bg-danger"
        style="position: absolute !important;"
      >
        {#if executionState.queueJobIds.size > 99}
          99+
        {:else}
          {executionState.queueJobIds.size}
        {/if}
      </span>
    {/if}
  </button>

  <div class="d-none">
    <div class="list-group overflow-y-auto" bind:this={queueListElement} style="max-height: 250px;">
      {#if executionState.queueJobIds.size > 0}
        {#each executionState.queueJobIds as [jobId] (jobId)}
          <div
            class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-1 px-2"
          >
            <div class="flex-grow-1 overflow-hidden text-truncate small">
              <span>{jobId}</span>
              <div class="w-100 progress" style="height: 4px;" role="progressbar">
                {#if executionState.processingJobId === jobId}
                  <div class="progress-bar" style="width: {executionState.jobProgress}%"></div>
                {/if}
              </div>
            </div>
            <button
              class="btn btn-xs btn-danger d-flex justify-content-center align-items-center p-1"
              aria-label={$t('action.remove')}
              onclick={(e: Event) => {
                e.stopPropagation();
                handleDeleteJob(jobId);
              }}><IconX size={14} /></button
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
    min-width: 2.2rem !important;
    max-width: 2.2rem !important;
    min-height: 2.2rem !important;
    max-height: 2.2rem !important;
    padding: 0;
  }

  .badge {
    width: 1.3rem !important;
    height: 1.3rem !important;
    padding: 0 !important;
    font-weight: bold !important;
  }
</style>
