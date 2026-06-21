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
</script>

<div title={widget.tooltip ?? ''} data-id={widget.id} data-name={widget.name}>
  <img
    class="object-contain preview-image"
    class:is-error={isError}
    style:max-width={options.isFloating ? '' : '256px'}
    style:max-height={options.isFloating ? '' : '256px'}
    src={previewUrl}
    alt="preview"
    onerror={() => (isError = true)}
    onload={() => (isError = false)}
  />
</div>

<style lang="scss">
  .is-error {
    visibility: hidden;
  }
</style>
