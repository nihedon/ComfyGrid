<script lang="ts">
  import { refreshModels } from '@/services/models-service';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  type UploadWidget = ComfyGridWidget<string>;

  let { widget, isFloating = false }: { widget: UploadWidget; isFloating?: boolean } = $props();

  const uiState = appState.uiState;
  const modalState = appState.inpaintModalState;

  let cacheBuster = $state(Math.random());
  let isFullscreen = $state(false);

  const previewUrl = $derived.by(() => {
    if (!widget.image) return '';
    const { filename, subfolder, type } = widget.image;
    return `/api/view?type=${type}&filename=${encodeURIComponent(filename)}&subfolder=${subfolder}&rand=${cacheBuster}`;
  });

  function openPaintModal() {
    if (!widget.image) return;

    modalState.setup(widget.image, previewUrl, (filename: string) => {
      widget.image.filename = filename;
      cacheBuster = Math.random(); // Force refresh preview

      widget.updateComfyUiSelect({ value: filename, addOptions: [filename] });
      widget.node.drawBackground();
      refreshModels('images');
    });
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: DragEvent) {
    uiState.isDragging = false;
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      widget.callback(files);
    }
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }
</script>

<div class="flex-grow-1 overflow-y-hidden" title={widget.tooltip ?? ''} data-name={widget.name}>
  <div
    class="d-flex flex-grow-1 h-100 position-relative justify-content-center border rounded p-1 checkerboard"
    style="background-color: #f8f9fa; min-height: 0;"
  >
    <div class="vstack position-absolute gap-1 top-0 end-0 me-1 mt-1">
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button
        class="btn btn-primary btn-sm"
        onclick={openPaintModal}
        data-bs-toggle="modal"
        data-bs-target="#models-modal-paint"
      >
        <i class="pi pi-pencil"></i>
      </button>
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <img
      id={widget.id}
      class="w-100 h-100 object-fit-contain"
      src={previewUrl}
      alt="preview"
      style:max-height={isFloating ? '' : '256px'}
      style:min-height={isFloating ? '' : '256px'}
      style:cursor="zoom-in"
      onclick={() => (isFullscreen = true)}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
    />
  </div>
</div>

{#if isFullscreen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    class="fullscreen-overlay d-flex align-items-center justify-content-center"
    onclick={() => (isFullscreen = false)}
  >
    <img src={previewUrl} alt="Fullscreen preview" class="fullscreen-image" />
  </div>
{/if}

<style lang="scss">
  .checkerboard {
    background-image:
      linear-gradient(45deg, #ccc 25%, transparent 25%),
      linear-gradient(-45deg, #ccc 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #ccc 75%),
      linear-gradient(-45deg, transparent 75%, #ccc 75%);
    background-size: 16px 16px;
    background-position:
      0 0,
      0 8px,
      8px -8px,
      -8px 0px;
    background-color: #fff;
  }
</style>
