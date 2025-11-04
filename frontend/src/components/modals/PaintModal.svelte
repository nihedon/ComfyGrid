<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import PaintWidget from '../widgets/PaintWidget.svelte';

  const modalState = appState.inpaintModalState;

  function close() {
    modalState.closePaintModal();
  }

  function handleMaskExport(maskDataUrl: string, imageDataUrl: string) {
    modalState.savePaint(maskDataUrl, imageDataUrl).then(() => {
      close();
    });
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
>
  <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" style:max-width="60vw;">
    <div class="modal-content">
      <div class="modal-body p-0">
        <PaintWidget
          src={modalState.imageUrl}
          alt="Paint Modal Image"
          maxWidth={800}
          maxHeight={600}
          onMaskExport={handleMaskExport}
        />
      </div>
    </div>
  </div>
</div>
