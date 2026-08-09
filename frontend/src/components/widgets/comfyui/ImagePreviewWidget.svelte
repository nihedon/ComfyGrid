<script lang="ts">
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget, options }: { widget: ComfyGridWidget; options: { isFloating: boolean } } = $props();

  let isError = $state(false);

  let cacheBuster = $state(Math.random());

  const previewUrl = $derived.by(() => {
    if (widget.image?.filename) {
      return `/api/view?type=${widget.image.type}&filename=${widget.image.filename}&subfolder=${widget.image.subfolder}&rand=${cacheBuster}`;
    }
    return '';
  });
  let imageDimension = $state<{ width: number; height: number } | null>(null);

  function handleImageLoad(e: Event) {
    isError = false;
    const img = e.currentTarget as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) {
      imageDimension = { width: img.naturalWidth, height: img.naturalHeight };
    }
  }

  function handleImageError() {
    isError = true;
    imageDimension = null;
  }
</script>

<div
  class="position-relative d-inline-block"
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
>
  {#if imageDimension && !isError}
    <span
      class="position-absolute bottom-0 start-0 m-1 px-1 py-0.5 bg-dark bg-opacity-75 text-white rounded font-monospace small user-select-none z-1"
      style="font-size: 0.75rem;"
    >
      {imageDimension.width} × {imageDimension.height}
    </span>
  {/if}

  <img
    class="object-contain preview-image"
    class:is-error={isError}
    style:max-width={options.isFloating ? '' : '256px'}
    style:max-height={options.isFloating ? '' : '256px'}
    src={previewUrl}
    alt="preview"
    onerror={handleImageError}
    onload={handleImageLoad}
  />
</div>

<style lang="scss">
  .is-error {
    visibility: hidden;
  }
</style>
