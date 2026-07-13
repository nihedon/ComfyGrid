<script lang="ts">
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';

  let { model, type }: { model: Model; type: ModelTypes } = $props();

  function getPreviewUrl(path: string) {
    const pathes = path.split(/[/\\]/);
    const filename = pathes[pathes.length - 1];
    pathes.pop();
    const subfolder = pathes.join('/');
    return `/api/view?type=input&filename=${filename}&subfolder=${subfolder}&rand=${Math.random()}`;
  }
</script>

<div class="w-100 h-100" class:checkerboard={type === 'images' || type === 'videos'}>
  {#if model.preview || type === 'images' || type === 'videos'}
    {@const src =
      type === 'images' || type === 'videos'
        ? getPreviewUrl(model.path)
        : `/comfygrid/api/thumbnail=${model.preview}?t=${model.modified}`}
    {#if model.preview || type === 'images'}
      <img
        class="w-100 h-100 {type === 'images' ? 'object-fit-contain' : 'object-fit-cover'}"
        {src}
        loading="lazy"
        alt={model.name}
      />
    {:else if type === 'videos'}
      <video
        class="w-100 h-100 {type === 'videos' ? 'object-fit-contain' : 'object-fit-cover'}"
        {src}
        preload="metadata"
      >
        <track kind="captions" />
      </video>
    {/if}
  {:else}
    <div
      class="vstack gap-2 fs-1 text-secondary fw-bold w-100 h-100 justify-content-center align-items-center user-select-none"
    >
      <span>NO</span>
      <span>PREVIEW</span>
    </div>
  {/if}
</div>
