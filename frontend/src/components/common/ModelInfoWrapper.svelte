<script lang="ts">
  import type { Snippet } from 'svelte';
  import { comfyGridApiClient } from '@/api/api-client';
  import { appState } from '@/states/app-state.svelte';
  import type { Model } from '@/states/storage-state.svelte';
  import logger from '@/utils/logger';
  import SelectablePopover from './SelectablePopover.svelte';

  let {
    model,
    subdirs,
    showMenuIcons = true,
    children,
  }: {
    model: Model;
    subdirs?: ReadonlyArray<string>;
    showMenuIcons?: boolean;
    children: Snippet;
  } = $props();

  let triggerWordsPopoverElement = $state<HTMLElement | null>(null);
  let containerElement = $state<HTMLElement | null>(null);
  let triggerWordsElement = $state<HTMLElement | null>(null);

  const metadata = $derived(
    model.metadata || {
      id: '',
      modelId: '',
      model: { nsfw: false },
      trainedWords: [],
    },
  );

  const sizeUnits = ['B', 'KB', 'MB', 'GB', 'TB'];
  const sizeWithUnit = $derived.by(() => {
    let size = model.size;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < sizeUnits.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${sizeUnits[unitIndex]}`;
  });

  const triggerWords = $derived.by(() => {
    const words = metadata.trainedWords;
    if (!words || words.length === 0) return [];
    return words;
  });

  async function showDescription(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await fetchDetails();
    appState.descriptionModalState.show(model, subdirs ?? []);
  }

  async function fetchDetails() {
    if (model.retrieved) return;
    if (!model.has_metadata && !model.has_description) return;

    logger.info(`[${model.name}] fetching details`);

    const res = await comfyGridApiClient.getModelInfo(model.full_path);
    if (res.ok) {
      const data = res.json;
      if (data.description) {
        model.description = data.description;
      }
      if (data.metadata) {
        model.metadata = data.metadata;
      }
      if (data.rate !== undefined) {
        model.rate = data.rate;
      }
      if (data.favorite !== undefined) {
        model.favorite = data.favorite;
      }
    }
    model.retrieved = true;
  }

  $effect(() => {
    if (containerElement) {
      const callback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            fetchDetails();
            observer.unobserve(entry.target);
          }
        });
      };

      const observer = new IntersectionObserver(callback);
      observer.observe(containerElement);
    }
  });
</script>

<div class="frosted-glass rounded-2 position-absolute fs-7 top-0 start-0 px-3 text-white">
  {model.path.substring(0, model.path.lastIndexOf('\\')).replaceAll('\\', ' / ')}
</div>

{@render children()}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="frosted-glass vstack position-absolute w-100 fw-bold bottom-0 start-0 text-white text-break pt-1"
  onmouseenter={fetchDetails}
  bind:this={containerElement}
>
  {#if showMenuIcons}
    <div class="d-flex px-1 menu-icon">
      <!-- svelte-ignore a11y_invalid_attribute -->
      <a href="#" aria-label="Show description" onclick={showDescription}>
        <i class="pi pi-info-circle text-white"></i>
      </a>
      {#if metadata.modelId}
        {@const civitaiDomain = metadata.model?.nsfw ? 'civitai.red' : 'civitai.com'}
        {@const modelVersionId = metadata.id ? `?modelVersionId=${metadata.id}` : ''}
        <a
          href={`https://${civitaiDomain}/models/${metadata.modelId}/${modelVersionId}`}
          target="_blank"
          aria-label="Open Civitai"
          onclick={(e) => e.stopPropagation()}
        >
          <i class="pi pi-globe text-white"></i>
        </a>
      {/if}
      {#if triggerWords.length > 0}
        <!-- svelte-ignore a11y_invalid_attribute -->
        <a
          href="#"
          aria-label="Show trigger words"
          onclick={(e) => e.stopPropagation()}
          bind:this={triggerWordsPopoverElement}
        >
          <i class="pi pi-tag text-white"></i>
        </a>

        <div class="d-none">
          <div class="list-group overflow-y-auto fs-6" bind:this={triggerWordsElement}>
            {#each triggerWords as tag, i (i)}
              <span class="list-group-item d-flex align-items-center gap-3">
                <span class="tag flex-grow-1">{tag}</span>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_missing_attribute -->
                <a
                  class="btn py-0 px-1"
                  aria-label="Copy trigger word"
                  onclick={() => navigator.clipboard.writeText(tag)}
                >
                  <i class="pi pi-copy"></i>
                </a>
              </span>
            {/each}
          </div>
        </div>
        <SelectablePopover
          triggerElement={triggerWordsPopoverElement}
          contentsElement={triggerWordsElement}
          placement="top"
          customClass="trigger-words"
        ></SelectablePopover>
      {/if}
    </div>
  {/if}
  <span class="fs-6 px-2">{model.name}</span>
  <div class="d-flex align-items-end fs-6 px-2 pb-2">
    <span class="flex-grow-1">{model.extension}</span>
    <span class="text-end flex-shrink-1">{sizeWithUnit}</span>
  </div>
</div>

<style lang="scss">
  .frosted-glass {
    line-height: 1.2;
    background-color: #20202070;
    -webkit-text-stroke: 2px #000000a0;
    paint-order: stroke;
  }

  .menu-icon a {
    padding: 0.2rem 0.6rem;
    border-radius: 0.3rem;
  }

  .menu-icon a:hover {
    background-color: #20202060;
  }

  :global(.popover.trigger-words) {
    --bs-popover-max-width: 700px;
    --bs-popover-body-padding-x: 0 !important;
    --bs-popover-body-padding-y: 0 !important;
  }
</style>
