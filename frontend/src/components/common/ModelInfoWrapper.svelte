<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as bootstrap from 'bootstrap';
  import { appState } from '@/states/app-state.svelte';
  import type { Model } from '@/states/storage-state.svelte';
  import logger from '@/utils/logger';

  let {
    model,
    showMenuIcons = true,
    children,
  }: { model: Model; showMenuIcons?: boolean; children: Snippet } = $props();

  let triggerWordsPopoverElement = $state<HTMLElement | null>(null);
  let menuIconsContainerElement = $state<HTMLElement | null>(null);

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
    const words = model.metadata?.trainedWords;
    if (!words || words.length === 0) return [];
    return words;
  });

  async function showDescription(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await fetchDetails();
    appState.descriptionModalState.show(model);
  }

  async function fetchDetails() {
    if (model.retrieved) return;
    if (!model.has_metadata && !model.has_description) return;

    logger.info(`[${model.name}] fetching details`);

    try {
      const res = await fetch(`/comfygrid/api/model_info=${model.full_path}`);
      if (res.ok) {
        const data = await res.json();
        if (data.description) {
          model.description = data.description;
        }
        if (data.metadata) {
          model.metadata = data.metadata;
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      model.retrieved = true;
    }
  }

  function buildTriggerWordItem(tag: string): string {
    return `<span class="list-group-item d-flex align-items-center gap-3">
              <span class="tag flex-grow-1">${tag}</span>
              <a class="btn py-0 px-1"><i class="pi pi-copy"></i></a>
            </span>`;
  }

  function buildTriggerWordsContent(tags: string[]): string {
    return `<div class="list-group">
              ${tags.map(buildTriggerWordItem).join('')}
            </div>`;
  }

  $effect(() => {
    if (!triggerWordsPopoverElement || triggerWords.length === 0) return;

    const popover = new bootstrap.Popover(triggerWordsPopoverElement);

    const handleShow = () => {
      const popoverElements = document.querySelectorAll('[data-bs-toggle="popover"]');
      popoverElements.forEach((el) => {
        if (el !== triggerWordsPopoverElement) {
          const instance = bootstrap.Popover.getInstance(el);
          instance?.hide();
        }
      });
    };

    const handleDocumentClick = (e: MouseEvent) => {
      const popoverEl = document.querySelector('.trigger-words.popover.show');
      if (
        popoverEl &&
        !popoverEl.contains(e.target as Node) &&
        !triggerWordsPopoverElement?.contains(e.target as Node)
      ) {
        popover.hide();
      }
    };

    const handleShown = () => {
      const popoverEl = document.querySelector<HTMLElement>(
        '.trigger-words.popover:not(.listener-attached)',
      );
      if (!popoverEl) return;
      popoverEl.querySelectorAll<HTMLElement>('.popover-body .tag').forEach((el) => {
        const aTag = el.nextElementSibling!;
        aTag.addEventListener('click', () => {
          navigator.clipboard.writeText(el.innerText ?? '');
        });
      });
      popoverEl.classList.add('listener-attached');
      
      // Delay attaching to prevent immediate trigger from the same click event
      setTimeout(() => document.addEventListener('click', handleDocumentClick), 0);
    };

    const handleHidden = () => {
      document.removeEventListener('click', handleDocumentClick);
    };

    triggerWordsPopoverElement.addEventListener('show.bs.popover', handleShow);
    triggerWordsPopoverElement.addEventListener('shown.bs.popover', handleShown);
    triggerWordsPopoverElement.addEventListener('hidden.bs.popover', handleHidden);

    return () => {
      document.removeEventListener('click', handleDocumentClick);
      triggerWordsPopoverElement?.removeEventListener('show.bs.popover', handleShow);
      triggerWordsPopoverElement?.removeEventListener('shown.bs.popover', handleShown);
      triggerWordsPopoverElement?.removeEventListener('hidden.bs.popover', handleHidden);
      popover.dispose();
    };
  });

  $effect(() => {
    if (menuIconsContainerElement) {
      const callback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            fetchDetails();
            observer.unobserve(entry.target);
          }
        });
      };

      const observer = new IntersectionObserver(callback);
      observer.observe(menuIconsContainerElement);
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
>
  {console.info(model)}
  {#if showMenuIcons}
    <div class="d-flex px-1 menu-icon" bind:this={menuIconsContainerElement}>
      {#if model.description}
        <!-- svelte-ignore a11y_invalid_attribute -->
        <a href="#" aria-label="Show description" onclick={showDescription}>
          <i class="pi pi-info-circle text-white"></i>
        </a>
      {/if}
      {#if model.metadata?.modelId}
        {@const civitaiDomain = model.metadata?.model?.nsfw ? 'civitai.red' : 'civitai.com'}
        {@const modelVersionId = model.metadata?.id ? `?modelVersionId=${model.metadata?.id}` : ''}
        <a
          href={`https://${civitaiDomain}/models/${model.metadata?.modelId}/${modelVersionId}`}
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
          data-bs-toggle="popover"
          data-bs-content={buildTriggerWordsContent(triggerWords)}
          data-bs-custom-class="trigger-words fs-6"
          data-bs-placement="top"
          data-bs-container="body"
          data-bs-html="true"
          onclick={(e) => e.stopPropagation()}
          bind:this={triggerWordsPopoverElement}
        >
          <i class="pi pi-tag text-white"></i>
        </a>
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
  }

  :global(.trigger-words .popover-body) {
    overflow-y: auto;
    padding: 0;
  }
</style>
