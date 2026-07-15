<script lang="ts">
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';
  import NoPreview from './NoPreview.svelte';

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
    <NoPreview />
  {/if}
</div>
