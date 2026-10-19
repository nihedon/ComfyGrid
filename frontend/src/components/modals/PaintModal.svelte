<script lang="ts">
  import { Modal } from 'bootstrap';
  import { appState } from '@/states/app-state.svelte';
  import PaintWidget from '../widgets/PaintWidget.svelte';

  const modalState = appState.inpaintModalState;
  let modalElement = $state<HTMLDivElement>();
  let saving = $state(false);

  $effect(() => {
    const element = modalElement;
    if (!element) return;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const handleHidden = () => {
      const handleUpload = modalState.handleUpload;
      // Preserve a newer session opened before the deferred cleanup runs.
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        closeTimer = undefined;
        if (modalState.handleUpload === handleUpload) close();
      }, 0);
    };
    const handleHide = (event: Event) => {
      if (saving) event.preventDefault();
    };
    element.addEventListener('hide.bs.modal', handleHide);
    element.addEventListener('hidden.bs.modal', handleHidden);
    return () => {
      clearTimeout(closeTimer);
      element.removeEventListener('hide.bs.modal', handleHide);
      element.removeEventListener('hidden.bs.modal', handleHidden);
    };
  });

  function close() {
    modalState.closePaintModal();
  }

  async function handleMaskExport(maskDataUrl: string, imageDataUrl: string) {
    if (saving) return;
    saving = true;
    const handleUpload = modalState.handleUpload;
    const baseImage = modalState.baseImage;
    try {
      const saved = await modalState.savePaint(maskDataUrl, imageDataUrl);
      saving = false;
      if (
        saved &&
        modalState.handleUpload === handleUpload &&
        modalState.baseImage === baseImage &&
        modalElement?.isConnected
      ) {
        Modal.getInstance(modalElement)?.hide();
      }
    } finally {
      saving = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (!saving && e.target === e.currentTarget) {
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
            {saving}
            onMaskExport={handleMaskExport}
          />
        {/if}
      </div>
    </div>
  </div>
</div>
