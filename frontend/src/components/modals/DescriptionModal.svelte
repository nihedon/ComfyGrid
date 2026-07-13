<script lang="ts">
  import { Modal } from 'bootstrap';
  import { comfyGridApiClient } from '@/api/api-client';
  import { appState } from '@/states/app-state.svelte';

  let modalElement = $state<HTMLDivElement>();
  let bsModal: Modal | null = null;
  let isFetching = $state(false);
  let isSaving = $state(false);

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

  async function handleFetch() {
    if (!descriptionState.model?.metadata?.id) return;
    const id = descriptionState.model.metadata.id;
    isFetching = true;
    try {
      const res = await fetch(`https://civitai.red/api/v1/model-versions/${id}`);
      if (!res.ok) throw new Error('Failed to fetch from Civitai');
      const data = await res.json();

      descriptionState.model.metadata = data;
      descriptionState.model.has_metadata = true;
    } catch (e) {
      console.error(e);
      alert(e);
    } finally {
      isFetching = false;
    }
  }

  async function handleSave() {
    if (!descriptionState.model) return;
    isSaving = true;
    try {
      const apiRes = await comfyGridApiClient.postModelInfo(descriptionState.model.full_path, descriptionState.model.metadata || {});
      if (!apiRes.ok) {
        throw new Error('Failed to save model info');
      }
      handleClose();
    } catch (e) {
      console.error(e);
      alert(e);
    } finally {
      isSaving = false;
    }
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
        <div class="modal-footer justify-content-start">
          <div class="flex flex-row flex-grow-1">
            {#if descriptionState.model.metadata?.id}
              <button
                type="button"
                class="btn btn-secondary"
                onclick={handleFetch}
                disabled={isFetching || isSaving}
              >
                {#if isFetching}
                  <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                  <span class="visually-hidden" role="status">Loading...</span>
                {:else}
                  <i class="pi pi-refresh me-1"></i>Fetch Info
                {/if}
              </button>
            {/if}
          </div>
          <button type="button" class="btn btn-primary" onclick={handleSave} disabled={isSaving || isFetching}>
            {#if isSaving}
              <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              <span class="visually-hidden" role="status">Saving...</span>
            {:else}
              Save
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>
