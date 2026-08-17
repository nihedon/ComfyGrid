<script lang="ts">
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';
  import NoPreview from './NoPreview.svelte';

  let { model, type }: { model: Model; type: ModelTypes } = $props();

  let videoElement = $state<HTMLVideoElement>();

  function getPreviewUrl(path: string) {
    const pathes = path.split(/[/\\]/);
    const filename = pathes[pathes.length - 1];
    pathes.pop();
    const subfolder = pathes.join('/');
    return `/api/view?type=input&filename=${filename}&subfolder=${subfolder}&rand=${Math.random()}`;
  }

  function isVideoFile(url: string): boolean {
    const cleanUrl = url.split('?')[0].toLowerCase();
    return ['.mp4', '.webm', '.m4v', '.ogv', '.mov'].some((ext) => cleanUrl.endsWith(ext));
  }

  function handleMouseEnter() {
    if (videoElement) {
      videoElement.play().catch(() => {});
    }
  }

  function handleMouseLeave() {
    if (videoElement) {
      videoElement.pause();
      videoElement.currentTime = 0;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="w-100 h-100 position-relative"
  class:checkerboard={type === 'images' || type === 'videos'}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  {#if model.preview || type === 'images' || type === 'videos'}
    {@const src =
      type === 'images' || type === 'videos'
        ? getPreviewUrl(model.path)
        : `/comfygrid/api/thumbnail=${model.preview}?t=${model.modified}`}
    {@const isVideo = type === 'videos' || isVideoFile(model.preview ?? '')}

    {#if isVideo}
      <video
        bind:this={videoElement}
        class="w-100 h-100 {type === 'videos' ? 'object-fit-contain' : 'object-fit-cover'}"
        src={`${src}#t=0.001`}
        preload="metadata"
        muted
        loop
        playsinline
      >
        <track kind="captions" />
      </video>
    {:else}
      <img
        class="w-100 h-100 {type === 'images' ? 'object-fit-contain' : 'object-fit-cover'}"
        {src}
        loading="lazy"
        alt={model.name}
      />
    {/if}
  {:else}
    <NoPreview />
  {/if}
</div>
