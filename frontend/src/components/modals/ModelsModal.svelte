<script lang="ts">
  import { Modal } from 'bootstrap';
  import { appState } from '@/states/app-state.svelte';
  import ModelList from '../common/ModelList.svelte';

  let modalElement = $state<HTMLDivElement>()!;
  let bsModal = $state<Modal>();

  const modalState = appState.modalState;

  $effect(() => {
    if (!modalElement) return;
    bsModal = Modal.getOrCreateInstance(modalElement);

    const handleHidden = () => {
      modalState.clearModelDir();
    };
    const handleShown = () => {
      const selected = modalElement.querySelector<HTMLElement>('.card.selected');
      selected?.scrollIntoView({ behavior: 'instant', block: 'center' });
    };
    modalElement.addEventListener('hidden.bs.modal', handleHidden);
    modalElement.addEventListener('shown.bs.modal', handleShown);
    return () => {
      modalElement!.removeEventListener('hidden.bs.modal', handleHidden);
      modalElement!.removeEventListener('shown.bs.modal', handleShown);
    };
  });

  $effect(() => {
    if (!bsModal) return;
    if (modalState.modelDir) {
      bsModal.show();
    } else {
      bsModal.hide();
    }
  });
</script>

<div
  class="modal"
  id="models-modal"
  tabindex="-1"
  aria-labelledby="models-modal-label"
  aria-hidden="true"
  bind:this={modalElement}
>
  <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
    <div class="modal-content">
      {#if modalState.modelDir}
        {#key modalState.modelDir}
          <ModelList
            dir={modalState.modelDir}
            subdirs={modalState.modelSubdirs}
            valueSet={modalState.valueSet}
            action={null}
            focusSelectedModel={true}
          />
        {/key}
      {/if}
    </div>
  </div>
</div>

<style lang="scss">
  .modal-dialog {
    max-width: 80vw;
  }
</style>
