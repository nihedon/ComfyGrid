<script lang="ts">
  import { Modal } from 'bootstrap';
  import { appState } from '@/states/app-state.svelte';

  let modalElement = $state<HTMLDivElement>();
  let bsModal: Modal | null = null;

  const dialogState = appState.dialogState;

  const isFatal = $derived(dialogState?.current?.type === 'TypeFatal');

  $effect(() => {
    if (!modalElement) return;
    bsModal = Modal.getOrCreateInstance(modalElement);

    const handleHidden = () => dialogState.close();
    modalElement.addEventListener('hidden.bs.modal', handleHidden);
    return () => {
      modalElement!.removeEventListener('hidden.bs.modal', handleHidden);
    };
  });

  $effect(() => {
    if (!bsModal) return;
    if (dialogState.current) {
      showTraceback = false;
      bsModal.show();
    } else {
      bsModal.hide();
      showTraceback = false;
    }
  });

  function handleClose() {
    dialogState.close();
  }

  let showTraceback = $state(false);
  function handleOpenTraceback() {
    showTraceback = true;
  }

  let reloading = $state(false);
  async function handleReload() {
    reloading = true;
    location.reload();
  }
</script>

<div
  class="modal fade"
  tabindex="-1"
  aria-hidden="true"
  data-bs-backdrop={isFatal ? 'static' : undefined}
  data-bs-keyboard={isFatal ? 'false' : undefined}
  bind:this={modalElement}
>
  <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
    <div class="modal-content">
      {#if dialogState.current}
        {@const { type, title, message, traceback } = dialogState.current}
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2">
            {#if type === 'TypeInfo'}
              <i class="pi pi-info-circle text-info"></i>
            {:else if type === 'TypeError'}
              <i class="pi pi-info-circle text-error"></i>
            {:else if type === 'TypeFatal'}
              <i class="pi pi-exclamation-triangle text-fatal"></i>
            {/if}
            {title}
          </h5>
          <button type="button" class="btn-close" aria-label="Close" onclick={handleClose}></button>
        </div>
        <div class="modal-body">
          <pre class="mb-0">{message}</pre>
          {#if showTraceback}
            <hr />
            <pre class="mb-0">{traceback.join('').replaceAll('\\n', '\n')}</pre>
          {/if}
        </div>
        <div class="modal-footer">
          {#if !showTraceback}
            {#if traceback && traceback.length > 0}
              <button type="button" class="btn btn-secondary" onclick={handleOpenTraceback}
                >Traceback</button
              >
            {/if}
          {/if}
          {#if type === 'TypeFatal'}
            <button
              type="button"
              class="btn btn-primary d-flex align-items-center gap-2"
              onclick={handleReload}
              disabled={reloading}
            >
              {#if reloading}
                <i class="pi pi-spin pi-spinner"></i>
              {:else}
                <i class="pi pi-refresh"></i>
              {/if}
              Reload
            </button>
          {:else}
            <button type="button" class="btn btn-secondary" onclick={handleClose}>Close</button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
