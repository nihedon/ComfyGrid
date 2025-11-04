<script lang="ts">
  import { Modal } from 'bootstrap';
  import { appState } from '@/states/app-state.svelte';

  let modalElement = $state<HTMLDivElement>();
  let bsModal: Modal | null = null;

  const descriptionState = appState.descriptionModalState;

  $effect(() => {
    if (!modalElement) return;
    bsModal = Modal.getOrCreateInstance(modalElement);

    const handleShown = () => {
      const modals = document.querySelectorAll('.modal.show');
      if (modals.length > 1) {
        const zIndex = 1050 + 10 * modals.length;
        modalElement!.style.zIndex = zIndex.toString();
        const backdrops = document.querySelectorAll<HTMLElement>('.modal-backdrop.show');
        if (backdrops.length > 0) {
          backdrops[backdrops.length - 1].style.zIndex = (zIndex - 1).toString();
        }
      }
    };

    const handleHidden = () => descriptionState.close();
    
    modalElement.addEventListener('shown.bs.modal', handleShown);
    modalElement.addEventListener('hidden.bs.modal', handleHidden);
    return () => {
      modalElement!.removeEventListener('shown.bs.modal', handleShown);
      modalElement!.removeEventListener('hidden.bs.modal', handleHidden);
    };
  });

  $effect(() => {
    if (!bsModal) return;
    if (descriptionState.model) {
      bsModal.show();
    } else {
      bsModal.hide();
    }
  });

  function handleClose() {
    descriptionState.close();
  }
</script>

<div class="modal fade" tabindex="-1" aria-hidden="true" bind:this={modalElement}>
  <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
    <div class="modal-content">
      {#if descriptionState.model}
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="pi pi-file-o me-2"></i>{descriptionState.model.name}
          </h5>
          <button type="button" class="btn-close" aria-label="Close" onclick={handleClose}></button>
        </div>
        <div class="modal-body">
          <div class="row">
            <div class={descriptionState.model.preview ? 'col-8' : 'col-12'}>
              <pre
                class="mb-0 font-monospace"
                style="white-space: pre-wrap; word-break: break-word;">{descriptionState.model
                  .description}</pre>
            </div>
            {#if descriptionState.model.preview}
              <div class="col-4">
                <img
                  src={`/comfygrid/api/thumbnail=${descriptionState.model.preview}`}
                  class="img-fluid rounded border"
                  alt="Preview"
                />
              </div>
            {/if}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick={handleClose}>Close</button>
        </div>
      {/if}
    </div>
  </div>
</div>
