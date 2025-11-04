<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget } = $props();

  const uiState = appState.uiState;

  let cacheBuster = $state(Math.random());

  const previewUrl = $derived.by(() => {
    if (widget.value) {
      return `/api/view?type=input&filename=${encodeURIComponent(widget.value)}&subfolder=&rand=${cacheBuster}`;
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

<div class="object-contain" title={widget.tooltip ?? ''}>
  <audio
    id={widget.id}
    class="flex-grow-1"
    style="height: 34px"
    src={previewUrl}
    controls
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  ></audio>
</div>
