<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget, isFloating }: { widget: ComfyGridWidget; isFloating: boolean } = $props();

  const uiState = appState.uiState;

  let cacheBuster = $state(Math.random());

  const previewUrl = $derived.by(() => {
    if (widget.image?.filename) {
      return `/api/view?type=${widget.image.type}&filename=${encodeURIComponent(widget.image.filename)}&subfolder=${widget.image.subfolder}&rand=${cacheBuster}`;
    }
    return '';
  });

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
</script>

<div
  class="object-contain"
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
>
  <video
    style={isFloating ? 'height: 100%; width: 100%;' : 'max-width: 100%; max-height: 256px;'}
    src={previewUrl}
    controls
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}><track kind="captions" /></video
  >
</div>
