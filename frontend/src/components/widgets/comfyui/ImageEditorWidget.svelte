<script lang="ts">
  import { Paintbrush } from '@lucide/svelte';
  import { comfyUiApiClient } from '@/api/api-client';
  import { t } from '@/i18n/i18n';
  import { refreshModels } from '@/services/models-service';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';
  import logger from '@/utils/logger';

  type UploadWidget = ComfyGridWidget<string>;

  let { widget, options }: { widget: UploadWidget; options: { isFloating: boolean } } = $props();

  const uiState = appState.uiState;
  const modalState = appState.inpaintModalState;

  let cacheBuster = $state(Math.random());
  let isFullscreen = $state(false);
  let imageRetryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let uploadGeneration = 0;
  let uploading = $state(false);

  $effect(() => {
    const target = widget;
    uploading = false;
    return () => {
      void target;
      uploadGeneration++;
      clearTimeout(retryTimer);
    };
  });

  $effect(() => {
    const { filename, subfolder, type } = widget.image ?? {};
    void [filename, subfolder, type];
    imageDimension = null;
    imageRetryCount = 0;
    clearTimeout(retryTimer);
    return () => clearTimeout(retryTimer);
  });

  const previewUrl = $derived.by(() => {
    if (!widget.image) return '';
    const { filename, subfolder, type } = widget.image;
    return `/api/view?${new URLSearchParams({ type, filename, subfolder, rand: String(cacheBuster) })}`;
  });

  async function refreshImages() {
    try {
      await refreshModels('images');
    } catch (error) {
      logger.error('Failed to refresh images:', error);
      appState.toastState.addToast({ type: 'error', message: $t('toast.update_request_failed') });
    }
  }

  function openPaintModal() {
    if (!widget.image) return;
    const target = widget;
    const baseImage = { ...widget.image };

    modalState.setup(baseImage, previewUrl, (filename: string) => {
      const value = [baseImage.subfolder, filename].filter(Boolean).join('/');
      target.image = { ...baseImage, filename, type: 'input' };
      cacheBuster = Math.random(); // Force refresh preview

      target.updateSelect({ value, addOptions: [value] });
      target.onDrawBackground();
      void refreshImages();
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

  async function handleDrop(e: DragEvent) {
    uiState.isDragging = false;
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      imageRetryCount = 0;

      const generation = ++uploadGeneration;
      const target = widget;
      const previousImage = { ...target.image };
      uploading = true;
      try {
        const res = await comfyUiApiClient.uploadImage(file);
        if (
          generation !== uploadGeneration ||
          widget !== target ||
          target.image.filename !== previousImage.filename ||
          target.image.subfolder !== previousImage.subfolder ||
          target.image.type !== previousImage.type
        )
          return;
        if (
          !res.ok ||
          typeof res.json?.name !== 'string' ||
          !res.json.name ||
          (res.json.subfolder != null && typeof res.json.subfolder !== 'string') ||
          (res.json.type != null && typeof res.json.type !== 'string')
        )
          throw new Error(`HTTP ${res.status}`);
        const filename = res.json.name;
        const subfolder = res.json.subfolder ?? '';
        const type = res.json.type ?? 'input';
        const value = [subfolder, filename].filter(Boolean).join('/');
        target.image = {
          filename,
          subfolder,
          type,
        };
        cacheBuster = Math.random();
        target.updateSelect({ value, addOptions: [value] });
        target.onDrawBackground();
        await refreshImages();
      } catch (error) {
        if (generation !== uploadGeneration) return;
        logger.error('Image upload failed', error);
        appState.toastState.addToast({ type: 'error', message: $t('toast.send_to_input_failed') });
      } finally {
        if (generation === uploadGeneration) uploading = false;
      }
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
  let imageDimension = $state<{ width: number; height: number } | null>(null);

  function handleImageLoad(e: Event) {
    clearTimeout(retryTimer);
    imageRetryCount = 0;
    const img = e.currentTarget as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) {
      imageDimension = { width: img.naturalWidth, height: img.naturalHeight };
    }
  }

  function handleImageError() {
    if (imageRetryCount < 5) {
      imageRetryCount++;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        cacheBuster = Math.random();
      }, 300);
    }
  }
</script>

<div
  class="flex-grow-1 overflow-y-hidden"
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
>
  <div
    class="d-flex flex-grow-1 h-100 position-relative justify-content-center border rounded p-1 checkerboard"
    style="background-color: #f8f9fa; min-height: 0;"
  >
    <div class="vstack position-absolute gap-1 top-0 end-0 me-1 mt-1 z-1">
      <button
        class="btn btn-primary btn-sm btn-icon"
        onclick={openPaintModal}
        disabled={uploading || !widget.image?.filename}
        data-bs-toggle="modal"
        data-bs-target="#models-modal-paint"
      >
        <Paintbrush size={16} />
      </button>
    </div>

    {#if imageDimension}
      <span
        class="position-absolute bottom-0 start-0 m-1 px-1 py-0.5 bg-dark bg-opacity-75 text-white rounded font-monospace small user-select-none z-1"
        style="font-size: 0.75rem;"
      >
        {imageDimension.width} × {imageDimension.height}
      </span>
    {/if}

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <img
      class="w-100 h-100 object-fit-contain"
      src={previewUrl}
      alt="preview"
      style:max-height={options.isFloating ? '' : '256px'}
      style:min-height={options.isFloating ? '' : '256px'}
      style:cursor="zoom-in"
      onload={handleImageLoad}
      onerror={handleImageError}
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
