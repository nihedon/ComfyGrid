<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { t } from '@/i18n/i18n';
  import { galleryManager } from '@/managers/gallery-manager';
  import { appState } from '@/states/app-state.svelte';
  import type { GalleryJob, GalleryNode } from '@/states/gallery-state.svelte';
  import ImageCompare from '../widgets/ImageCompare.svelte';

  const optionState = appState.optionState;
  const workspaceState = appState.workspaceState;
  const galleryState = appState.galleryState;

  let fullscreen = $state(false);

  let container = $state<HTMLElement>();
  let jobElementContainer = $state<HTMLElement>();
  let nodeElementContainer = $state<HTMLElement>();
  const jobThumbMap = new SvelteMap<string, HTMLElement>();
  const nodeThumbMap = new SvelteMap<number, HTMLElement>();

  const showNodeStrip = $derived(galleryState.currentGalleryNodes.length > 1);

  const hasSavedImages = $derived(galleryState.galleryJobs.some((job) => job.hasSaved));

  const hasViewedImages = $derived(
    galleryState.galleryJobs.some((job) => job.completed && job.viewed),
  );

  const selectedNodeName = $derived.by(() => {
    const node = galleryState.currentGalleryNode;
    if (node?.nodeId) {
      return workspaceState.getRealNode(node.nodeId)?.title ?? node.nodeId;
    }
  });

  const galleryImageMaxSize = $derived(
    (optionState.opts.get('gallery_image_max_size') ??
      optionState.forms.get('gallery_image_max_size')?.default) as number,
  );

  function getMetadata(): Record<string, string> {
    return galleryState.currentGalleryJob?.metadata ?? {};
  }

  function deleteJob(e: Event) {
    if (!galleryState.currentGalleryJob) return;
    const oldIndex = galleryState.currentJobIndex;
    galleryState.deleteJob(galleryState.currentGalleryJob.jobId);

    setTimeout(() => {
      const nextIndex = Math.min(galleryState.galleryJobs.length - 1, oldIndex);
      galleryState.selectedJobIndex = Math.max(0, nextIndex);
    }, 0);
    e.stopPropagation();
  }

  function clearSavedImages() {
    galleryState.clearSavedJobs();
  }

  function clearAllImages() {
    galleryState.clearAllJobs();
  }

  function clearViewedImages() {
    galleryState.clearViewedJobs();
  }

  $effect(() => {
    if (galleryState.galleryJobs.length === 0) {
      galleryState.selectedJobIndex = 0;
      return;
    }
    if (galleryState.selectedJobIndex >= galleryState.galleryJobs.length) {
      galleryState.selectedJobIndex = galleryState.galleryJobs.length - 1;
    }
  });

  $effect(() => {
    if (galleryState.galleryJobs.length === 0) {
      galleryState.selectedNodeIndex = undefined;
    }
  });

  $effect(() => {
    if (galleryState.currentGalleryJob?.isRestoring) return;
    if (galleryState.currentGalleryJob?.hasPreviewNode) return;
    const jobId = galleryState.currentGalleryJob?.jobId;
    if (jobId) {
      const node = galleryState.currentGalleryNode;
      if (
        galleryState.currentGalleryJob?.completed &&
        node?.assets &&
        !galleryState.currentGalleryJob.viewed
      ) {
        galleryState.markViewed(jobId);
      }
    }
  });

  $effect(() => {
    if (fullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    container?.focus();
  });

  // Trigger lazy medium URL restoration when the displayed node changes
  $effect(() => {
    const node = galleryState.currentGalleryNode;
    if (
      node?.jobId &&
      node.nodeId != null &&
      node.assets &&
      !node.assets.mediumSingle &&
      !node.assets.mediumCompare &&
      !node.assets.isVideo
    ) {
      galleryState.ensureMediumUrls(node.jobId, node.nodeId, node.batchJobIndex);
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (fullscreen && (e.key === 'Escape' || e.key === 'Esc')) {
      fullscreen = false;
    }
    if (fullscreen || container!.contains(document.activeElement)) {
      if (e.key === 'ArrowLeft') {
        const index = Math.max(0, galleryState.currentJobIndex - 1);
        galleryState.selectedJobIndex = index;
      }
      if (e.key === 'ArrowRight') {
        const index = Math.min(
          galleryState.galleryJobs.length - 1,
          galleryState.currentJobIndex + 1,
        );
        galleryState.selectedJobIndex = index;
      }
    }
  }

  function registerJobElement(element: HTMLElement, galleryJob: GalleryJob) {
    jobThumbMap.set(galleryJob.jobId, element);
    return {
      destroy() {
        jobThumbMap.delete(galleryJob.jobId);
      },
    };
  }

  function registerNodeElement(element: HTMLElement, galleryNode: GalleryNode) {
    nodeThumbMap.set(galleryNode.nodeIndex, element);
    return {
      destroy() {
        nodeThumbMap.delete(galleryNode.nodeIndex);
      },
    };
  }

  function scrollToCenter(target: HTMLElement, container: HTMLElement) {
    const targetRect = target.offsetLeft;
    const targetWidth = target.offsetWidth;
    const containerWidth = container.offsetWidth;

    const scrollToX = targetRect - containerWidth / 2 + targetWidth / 2;

    container.scrollTo({
      left: scrollToX,
      behavior: 'smooth',
    });
  }

  function scrollToActiveJobThumbnail() {
    const target = jobThumbMap.get(galleryState.currentGalleryJob?.jobId ?? '');
    if (target && jobElementContainer) {
      scrollToCenter(target, jobElementContainer);
    }
  }

  function scrollToActiveNodeThumbnail() {
    const target = nodeThumbMap.get(galleryState.selectedNodeIndex ?? -1);
    if (target && nodeElementContainer) {
      scrollToCenter(target, nodeElementContainer);
    }
  }

  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const inspectedJobIdSet = new Set<string>();
  $effect(() => {
    const lastGalleryJob = galleryState.galleryJobs.at(-1);
    if (lastGalleryJob?.jobId && !inspectedJobIdSet.has(lastGalleryJob.jobId)) {
      inspectedJobIdSet.add(lastGalleryJob.jobId);
      const target = jobThumbMap.get(galleryState.currentGalleryJob?.jobId ?? '');
      if (target && jobElementContainer) {
        scrollToCenter(target, jobElementContainer);
      }
    }
  });

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    galleryState.currentJobIndex;
    setTimeout(scrollToActiveJobThumbnail, 50);
  });

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    galleryState.selectedNodeIndex;
    setTimeout(scrollToActiveNodeThumbnail, 50);
  });

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    fullscreen;
    setTimeout(scrollToActiveNodeThumbnail, 50);
    setTimeout(scrollToActiveJobThumbnail, 50);
  });

  function portal(node: HTMLElement, enabled: boolean) {
    const placeholder = document.createComment('portal-placeholder');
    let hasMoved = false;

    function update(isEnabled: boolean) {
      if (isEnabled && !hasMoved) {
        if (node.parentNode) {
          node.parentNode.insertBefore(placeholder, node);
          document.body.appendChild(node);
          hasMoved = true;
        }
      } else if (!isEnabled && hasMoved) {
        if (placeholder.parentNode) {
          placeholder.parentNode.insertBefore(node, placeholder);
          placeholder.remove();
          hasMoved = false;
        }
      }
    }

    update(enabled);

    return {
      update(newEnabled: boolean) {
        update(newEnabled);
      },
      destroy() {
        if (hasMoved) {
          node.remove();
        }
        if (placeholder.parentNode) {
          placeholder.remove();
        }
      },
    };
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="image-gallery-container vstack p-1 gap-2"
  style:display={galleryState.galleryJobs.length > 0 ? '' : 'none'}
  bind:this={container}
>
  <div
    class="w-100 position-relative"
    class:fullscreen-overlay={fullscreen}
    style="--previewImageMaxSize: {galleryImageMaxSize}px"
    data-ride="carousel"
    use:portal={fullscreen}
  >
    <!-- Compare toggle (if current image has multiple originals from comparison node) -->
    {#if galleryState.currentGalleryNode?.assets?.mediumCompare}
      <div class="btn-group w-100 pb-1 compare-buttons" role="group">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          name="compare-img"
          id="compare-img1"
          onclick={() => (galleryState.selectedCompareIndex = 0)}
          class:active={galleryState.selectedCompareIndex === 0}>Image 1</button
        >
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          name="compare-img"
          id="compare-img2"
          onclick={() => (galleryState.selectedCompareIndex = 1)}
          class:active={galleryState.selectedCompareIndex === 1}>Image 2</button
        >
      </div>
    {/if}

    <div
      class="slide-container vstack position-relative rounded-2 border-1 w-100 justify-content-center align-items-center"
      class:border={!fullscreen}
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="slide-main w-100 d-flex flex-grow-1" onclick={() => (fullscreen = !fullscreen)}>
        {#if galleryState.currentGalleryJob}
          <div class="contents w-100 d-flex justify-content-center align-items-center">
            {#if galleryState.currentGalleryNode?.saved ?? false}
              <span class="saved-label position-absolute text-white bg-warning fs-7 rounded-2 z-1"
                >SAVED</span
              >
            {/if}
            {#if galleryState.currentGalleryJob.completed && !galleryState.currentGalleryJob.hasPreviewNode}
              <button
                class="delete-button btn btn-danger position-absolute d-flex justify-content-center align-items-center fs-6 z-1"
                aria-label="delete"
                onclick={deleteJob}><i class="pi pi-trash"></i></button
              >
            {/if}
            {#if galleryState.currentGalleryNode?.assets}
              <!-- Generated image or video -->
              {@const genAssets = galleryState.currentGalleryNode.assets}
              {#if genAssets.isVideo && genAssets.videoSingle}
                <video
                  src={genAssets.videoSingle}
                  class="generated object-fit-contain"
                  controls
                  loop
                  autoplay
                  muted
                ></video>
              {:else}
                {@const isCompare = genAssets.mediumCompare && genAssets.mediumCompare.length > 1}
                {@const src = fullscreen
                  ? isCompare
                    ? genAssets.originalCompare
                    : [genAssets.originalSingle]
                  : isCompare
                    ? genAssets.mediumCompare
                    : [genAssets.mediumSingle]}
                {#if isCompare && src && src.length > 1}
                  <div class="generated object-fit-contain">
                    <ImageCompare
                      src1={(galleryState.selectedCompareIndex === 0 ? src[0] : src[1]) as string}
                      alt1="after"
                      src2={(galleryState.selectedCompareIndex === 0 ? src[1] : src[0]) as string}
                      alt2="before"
                      maxHeight={fullscreen ? undefined : galleryImageMaxSize}
                      value={0}
                      resetOnLeave={true}
                    ></ImageCompare>
                  </div>
                {:else if src && src[0]}
                  <img src={src[0] as string} alt="" class="generated object-fit-contain" />
                {/if}
              {/if}
            {:else if galleryState.currentGalleryNode?.previewUrl}
              <div class="vstack">
                <div class="progress" style="height: 5px;">
                  <div
                    class="progress-bar progress-bar-striped progress-bar-animated"
                    style:width="{appState.executionState.nodeProgress}%"
                  ></div>
                </div>
                <!-- Preview image during generation -->
                <img
                  src={galleryState.currentGalleryNode.previewUrl}
                  alt=""
                  class="generated object-fit-contain"
                />
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Job thumbnails strip -->
      <div
        class="slide-thumbnails w-100 d-flex align-items-start gap-2 p-2 overflow-x-auto"
        bind:this={jobElementContainer}
      >
        {#each galleryState.galleryJobs as galleryJob, index (galleryJob.jobId)}
          <button
            type="button"
            class="pi p-0 position-relative border-0 bg-transparent"
            class:preview={galleryJob.isPreview}
            class:viewed={!galleryJob.hasPreviewNode && galleryJob.viewed}
            class:saved={galleryJob.hasSaved}
            aria-label="Select job {index + 1}"
            onclick={() => {
              galleryState.selectedJobIndex = index;
              scrollToActiveJobThumbnail();
            }}
            use:registerJobElement={galleryJob}
          >
            <img
              class="w-100 rounded-2 border-2 object-fit-contain border-primary"
              class:active={index === galleryState.currentJobIndex}
              class:border={index === galleryState.currentJobIndex}
              src={galleryJob.thumbnail}
              alt="Thumbnail {index}"
            />
          </button>
        {/each}
      </div>

      <!-- Node thumbnails strip (shown only when current job has multiple nodes) -->
      {#if showNodeStrip}
        <div
          class="node-thumbnails w-100 d-flex align-items-start gap-2 py-1 px-2 overflow-x-auto"
          bind:this={nodeElementContainer}
        >
          {#each galleryState.currentGalleryNodes as galleryNode (`${galleryNode.nodeIndex}-${galleryNode.batchJobIndex}`)}
            <button
              type="button"
              class="p-0 border-0 bg-transparent position-relative flex-shrink-0"
              class:preview={galleryNode.isPreview}
              class:saved={galleryNode.saved}
              title="test-{workspaceState.getRealNode(galleryNode.nodeId)?.title}"
              aria-label={galleryNode.nodeName}
              onclick={() => {
                if (galleryState.selectedNodeIndex === galleryNode.nodeIndex) {
                  galleryState.selectedNodeIndex = undefined;
                } else {
                  galleryState.selectedNodeIndex = galleryNode.nodeIndex;
                }
              }}
              use:registerNodeElement={galleryNode}
            >
              <img
                class="rounded-2 border-2 object-fit-contain border-primary node-thumb"
                class:border={galleryNode.nodeIndex === galleryState.selectedNodeIndex}
                src={galleryNode.thumbnail}
                alt={galleryNode.nodeName}
              />
            </button>
          {/each}
        </div>
        {#if selectedNodeName && !fullscreen}
          <div class="node-name-label px-2 pb-1 text-muted small text-truncate w-100">
            {selectedNodeName}
          </div>
        {/if}
      {/if}
    </div>

    <div class="d-flex flex-row p-1 m-0 column-gap-2">
      {#if galleryState.currentGalleryJob && !galleryState.currentGalleryJob.isPreview}
        <button
          class="btn btn-primary flex-grow-1"
          aria-label="Save (ctrl + s)"
          onclick={() => galleryManager.saveImage(getMetadata())}
          ><i class="pi pi-save"></i> (ctrl + s)</button
        >
        <button
          class="btn btn-primary"
          aria-label="Download"
          onclick={() => galleryManager.downloadImage(getMetadata())}
          ><i class="pi pi-download"></i></button
        >
        <button
          class="btn btn-secondary"
          aria-label="Upload to input"
          title={$t('gallery.upload_to_input')}
          onclick={() => galleryManager.uploadToInput()}><i class="pi pi-upload"></i></button
        >
        <button
          class="btn btn-secondary"
          aria-label="Send to Image Info"
          title={$t('gallery.send_to_image_info')}
          onclick={() => galleryManager.sendToImageInfo()}><i class="pi pi-info-circle"></i></button
        >
      {:else}
        <div class="flex-grow-1"></div>
      {/if}
      <div class="dropdown">
        <button
          class="btn btn-danger dropdown-toggle"
          type="button"
          data-bs-toggle="dropdown"
          aria-expanded="false"
          title={$t('gallery.clear')}
        >
          <i class="pi pi-trash"></i>
        </button>
        <ul class="dropdown-menu dropdown-menu-end">
          <li>
            <button
              class="dropdown-item"
              type="button"
              onclick={clearSavedImages}
              disabled={!hasSavedImages}
            >
              <i class="pi pi-save me-2"></i>{$t('gallery.clear_saved')}
            </button>
          </li>
          <li>
            <button
              class="dropdown-item"
              type="button"
              onclick={clearViewedImages}
              disabled={!hasViewedImages}
            >
              <i class="pi pi-eye me-2"></i>{$t('gallery.clear_viewed')}
            </button>
          </li>
          <li>
            <button class="dropdown-item text-danger" type="button" onclick={clearAllImages}>
              <i class="pi pi-trash me-2"></i>{$t('gallery.clear_all')}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .slide-main {
    min-height: var(--previewImageMaxSize);

    .contents {
      img,
      video {
        height: 100%;
        width: 100%;
        max-height: 100%;
        max-width: 100%;
        object-fit: contain;
      }
    }
  }

  :not(.fullscreen-overlay) {
    .slide-main {
      .contents {
        img,
        video {
          max-height: var(--previewImageMaxSize);
          max-width: 100%;
        }
      }
    }
  }

  .slide-thumbnails {
    min-height: 115px;
    flex-shrink: 0;

    button:focus,
    button:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }

    img {
      min-width: 80px;
      max-width: 80px;
      min-height: 80px;
      max-height: 80px;
    }

    > button:not(.viewed)::before {
      content: '\e9dd';
      position: absolute;
      width: 80px;
      color: var(--bs-primary);
      font-size: 0.5rem;
      bottom: -11px;
    }
  }

  button.saved > img {
    box-shadow: 0 0 0px 2px var(--bs-warning) !important;
  }

  .node-thumbnails {
    flex-shrink: 0;
    button:focus,
    button:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
  }

  .node-thumb {
    min-width: 46px;
    max-width: 46px;
    min-height: 46px;
    max-height: 46px;
  }

  button.preview > img {
    opacity: 0.65;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.65;
    }
    50% {
      opacity: 1;
    }
  }

  .node-name-label {
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .saved-label {
    top: 4px;
    left: 4px;
    padding-left: 1rem;
    padding-right: 1rem;
    --bs-bg-opacity: 0.8;
  }

  .delete-button {
    top: 4px;
    right: 4px;
    width: 1.8rem;
    height: 1.8rem;
  }

  .fullscreen-overlay {
    position: fixed !important;
    display: flex;
    flex-direction: column;
    cursor: inherit;

    .compare-buttons {
      flex-shrink: 0;
    }

    .slide-container {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .slide-main {
      flex: 1;
      min-height: 0;
      display: flex;
      cursor: zoom-out;

      .contents {
        flex: 1;
        min-height: 0;
        display: flex;
        justify-content: center;
        align-items: center;

        .generated {
          max-width: 100%;
          max-height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100%;
          :global(> *) {
            height: 100%;
          }
        }

        img,
        video {
          max-width: 100% !important;
          max-height: 100% !important;
          width: auto;
          height: auto;
          object-fit: contain;
        }
      }
    }
  }
</style>
