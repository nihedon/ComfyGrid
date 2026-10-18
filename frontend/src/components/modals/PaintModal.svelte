<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import PaintWidget from '../widgets/PaintWidget.svelte';

  const modalState = appState.inpaintModalState;
  let modalElement = $state<HTMLDivElement>();

  $effect(() => {
    const element = modalElement;
    if (!element) return;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const handleHidden = () => {
      const handleUpload = modalState.handleUpload;
      // Bootstrap dismisses in capture phase, before Svelte handles Export.
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        closeTimer = undefined;
        if (modalState.handleUpload === handleUpload) close();
      }, 0);
    };
    element.addEventListener('hidden.bs.modal', handleHidden);
    return () => {
      clearTimeout(closeTimer);
      element.removeEventListener('hidden.bs.modal', handleHidden);
    };
  });

  function close() {
    modalState.closePaintModal();
  }

  function handleMaskExport(maskDataUrl: string, imageDataUrl: string) {
    void modalState.savePaint(maskDataUrl, imageDataUrl);
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      close();
    }
  }
</script>

<div
  class="modal"
  id="models-modal-paint"
  tabindex="-1"
  aria-labelledby="models-modal-label-paint"
  aria-hidden="true"
  onclick={handleBackdropClick}
  bind:this={modalElement}
>
  <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" style:max-width="60vw;">
    <div class="modal-content">
      <div class="modal-body p-0">
        {#if modalState.imageUrl}
          <PaintWidget
            src={modalState.imageUrl}
            alt="Paint Modal Image"
            maxWidth={800}
            maxHeight={600}
            onMaskExport={handleMaskExport}
          />
        {/if}
      </div>
    </div>
  </div>
</div>
