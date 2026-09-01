<script lang="ts">
  import {
    ChevronLeft,
    ChevronRight,
    Heart,
    Link,
    Pencil,
    Plus,
    RotateCw,
    Star,
    X,
  } from '@lucide/svelte';
  import { Modal } from 'bootstrap';
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import { comfyGridApiClient } from '@/api/api-client';
  import { appState } from '@/states/app-state.svelte';
  import NoPreview from '../common/NoPreview.svelte';

  let modalElement = $state<HTMLDivElement>();
  let bsModal: Modal | null = null;
  let isFetching = $state(false);
  let isSaving = $state(false);

  const descriptionState = appState.descriptionModalState;
  const model = $derived(descriptionState.model);
  const subdirs = $derived(descriptionState.subdirs);

  let tempPreviewUrl = $state<string | undefined>();
  let tempDescription = $state('');
  let tempUrl = $state<string | undefined>();
  let tempNsfw = $state(false);
  let tempRate = $state<number | undefined>();
  let tempFavorite = $state(false);
  let tempTrainedWords = $state<string[]>([]);
  let isEditingDescription = $state(false);
  let fetchedImages = $state<string[]>([]);
  let selectedImageIndex = $state(0);

  DOMPurify.addHook('afterSanitizeAttributes', function (node) {
    if ('target' in node) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  $effect(() => {
    if (!modalElement) return;
    bsModal = Modal.getOrCreateInstance(modalElement);

    const handleShown = () => {
      const modals = document.querySelectorAll('.modal.show');
      if (modals.length > 1) {
        const zIndex = 1050 + 10 * modals.length;
        modalElement!.style.zIndex = zIndex.toString();
        const backdrops = document.querySelectorAll<HTMLElement>('.modal-backdrop.show');
        if (backdrops.length > 0) {
          backdrops[backdrops.length - 1].style.zIndex = (zIndex - 1).toString();
        }
      }
    };

    const handleHidden = () => descriptionState.close();

    modalElement.addEventListener('shown.bs.modal', handleShown);
    modalElement.addEventListener('hidden.bs.modal', handleHidden);
    return () => {
      modalElement!.removeEventListener('shown.bs.modal', handleShown);
      modalElement!.removeEventListener('hidden.bs.modal', handleHidden);
    };
  });

  $effect(() => {
    if (!bsModal) return;
    if (model) {
      tempPreviewUrl = undefined;
      tempDescription = model.description ?? '';
      tempUrl = model.url;
      tempNsfw = model.nsfw ?? false;
      tempRate = model.rate;
      tempFavorite = model.favorite ?? false;
      tempTrainedWords = [...(model.trainedWords ?? [])];
      isEditingDescription = false;
      fetchedImages = [];
      selectedImageIndex = 0;
      bsModal.show();
    } else {
      bsModal.hide();
    }
  });

  function handleClose() {
    descriptionState.close();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFetchedData(data: any) {
    if (!data.model) {
      data.model = { nsfw: false };
    }
    if (!data.trainedWords) {
      data.trainedWords = [];
    }

    const imgUrls = (data.images ?? [])
      .filter(
        (image: Record<string, string>) => (image.type === 'image' || !image.type) && image.url,
      )
      .map((image: Record<string, string>) => image.url);

    if (imgUrls.length > 0) {
      fetchedImages = imgUrls;
      selectedImageIndex = 0;
      tempPreviewUrl = imgUrls[0];
    }

    tempNsfw = data.model?.nsfw ?? false;

    let rawWords = data.trainedWords;
    if (!rawWords || rawWords.length === 0) rawWords = data.trainedWord;
    const fetchedWords: string[] = Array.isArray(rawWords) ? rawWords : [];

    if (data.description) {
      tempDescription = data.description;
    }

    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const mergedWords = new Set<string>();

    for (const w of fetchedWords) {
      mergedWords.add(w);
    }

    for (const w of tempTrainedWords) {
      mergedWords.add(w);
    }

    tempTrainedWords = Array.from(mergedWords);
  }

  async function handleFetch() {
    let urlToFetch = tempUrl;
    if (!urlToFetch) {
      const prompted = prompt('Enter Model URL:');
      if (!prompted) return;
      urlToFetch = prompted;
      tempUrl = urlToFetch;
    }

    isFetching = true;
    try {
      const res = await comfyGridApiClient.postFetchInfo(urlToFetch);
      if (!res.ok) throw new Error('Failed to fetch from backend');
      applyFetchedData(res.json);
    } catch (e) {
      console.error(e);
      alert('Failed to fetch model info.');
    } finally {
      isFetching = false;
    }
  }

  function handleEditUrl() {
    const url = prompt('Enter Model URL:', tempUrl || '');
    if (url) {
      tempUrl = url;
    }
  }

  async function handleSave() {
    if (!model) return;
    isSaving = true;
    try {
      const payload: Record<string, unknown> = {
        description: tempDescription,
        url: tempUrl,
        nsfw: tempNsfw,
        rate: tempRate,
        favorite: tempFavorite,
        trainedWords: [...tempTrainedWords],
        previewUrl: tempPreviewUrl,
      };

      const apiRes = await comfyGridApiClient.postModelInfo(model.full_path, payload);
      if (!apiRes.ok) {
        throw new Error('Failed to save model info');
      }
      if (tempPreviewUrl) {
        const ext = isVideoFile(tempPreviewUrl) ? '.preview.mp4' : '.preview.png';
        let relPath = model.full_path.replace(/^models[/\\]/i, '');
        const lastDotIndex = relPath.lastIndexOf('.');
        if (lastDotIndex !== -1) {
          relPath = relPath.substring(0, lastDotIndex);
        }
        model.preview = relPath + ext;
      }
      model.description = tempDescription;
      model.url = tempUrl;
      model.nsfw = tempNsfw;
      model.rate = tempRate;
      model.favorite = tempFavorite;
      model.trainedWords = [...tempTrainedWords];
      model.modified = Date.now();
      handleClose();
    } catch (e) {
      console.error(e);
      alert(e);
    } finally {
      isSaving = false;
    }
  }

  function inputImageUrl() {
    const url = window.prompt('Enter image URL for preview:', tempPreviewUrl || '');
    if (url) {
      tempPreviewUrl = url;
    }
  }
  function isVideoFile(url?: string): boolean {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return ['.mp4', '.webm', '.m4v', '.ogv', '.mov'].some((ext) => cleanUrl.endsWith(ext));
  }
</script>

<div class="modal" tabindex="-1" aria-hidden="true" bind:this={modalElement}>
  <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
    <div class="modal-content">
      {#if model}
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="d-flex"
              style="cursor: pointer;"
              onclick={() => (tempFavorite = !tempFavorite)}
            >
              {#if tempFavorite}
                <Heart size={18} class="text-danger" fill="currentColor" />
              {:else}
                <Heart size={18} />
              {/if}
            </span>
            {model.name}
            {#if tempUrl}
              <a href={tempUrl} target="_blank" style="cursor: pointer;">
                <Link size={14} />
              </a>
            {/if}
          </h5>
          <button type="button" class="btn-close" aria-label="Close" onclick={handleClose}></button>
        </div>
        <div class="modal-body">
          <div class="d-flex gap-3">
            <div class="vstack flex-grow-1" style="min-width: 0;">
              <div class="mb-1 d-flex align-items-center justify-content-between">
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="nsfwSwitch"
                    bind:checked={tempNsfw}
                  />
                  <label class="form-check-label" for="nsfwSwitch">NSFW</label>
                </div>

                <div class="d-flex">
                  {#each [1, 2, 3, 4, 5] as star, i (i)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span
                      style="cursor: pointer;"
                      class="me-1"
                      onclick={() => (tempRate = tempRate === star ? undefined : star)}
                    >
                      {#if tempRate && tempRate >= star}
                        <Star size={20} class="text-warning" fill="currentColor" />
                      {:else}
                        <Star size={20} />
                      {/if}
                    </span>
                  {/each}
                </div>
              </div>
              <div class="mb-1 vstack flex-grow-1 description">
                <label class="fs-5 mb-0 form-label fw-bold d-flex align-items-center gap-2"
                  >Description
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <span
                    style="cursor: pointer;"
                    onclick={() => (isEditingDescription = !isEditingDescription)}
                  >
                    <Pencil size={14} class="text-secondary" />
                  </span>
                </label>
                {#if isEditingDescription}
                  <textarea
                    class="form-control flex-grow-1 font-monospace"
                    rows="10"
                    bind:value={tempDescription}></textarea>
                {:else}
                  <div class="form-control flex-grow-1 mb-0">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html DOMPurify.sanitize(marked.parse(tempDescription) as string)}
                  </div>
                {/if}
              </div>
              {#if !['checkpoints', 'unet', 'diffusion_models'].some((o) => subdirs.includes(o))}
                <div class="d-flex flex-column">
                  <!-- svelte-ignore a11y_label_has_associated_control -->
                  <label class="fs-5 mb-0 form-label fw-bold">Trained Words</label>
                  {#if tempTrainedWords}
                    {#each { length: tempTrainedWords.length }, i (i)}
                      <div class="input-group input-group-sm mb-1">
                        <input type="text" class="form-control" bind:value={tempTrainedWords[i]} />
                        <button
                          class="btn btn-danger d-flex align-items-center justify-content-center"
                          type="button"
                          onclick={() => {
                            tempTrainedWords.splice(i, 1);
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    {/each}
                  {/if}
                  <button
                    class="btn btn-sm btn-primary mt-1 d-inline-flex align-items-center gap-1"
                    onclick={() => {
                      tempTrainedWords.push('');
                    }}
                  >
                    <Plus size={16} />Add Word
                  </button>
                </div>
              {/if}
            </div>
            <div class="d-flex flex-column gap-2" style="width: 300px; min-width: 300px;">
              <div style="height: 400px;">
                {#if model.preview || tempPreviewUrl}
                  {@const currentUrl =
                    tempPreviewUrl ||
                    `/comfygrid/api/thumbnail=${model.preview}?t=${model.modified}`}
                  {@const isVideo = isVideoFile(tempPreviewUrl || model.preview)}
                  {#if isVideo}
                    <video
                      src={currentUrl}
                      class="img-fluid rounded border h-100 object-fit-cover w-100"
                      style="min-width: 300px; cursor: pointer;"
                      loop
                      muted
                      controls
                      playsinline
                      title="Click to set image/video URL"
                      onclick={inputImageUrl}
                    >
                      <track kind="captions" />
                    </video>
                  {:else}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <img
                      src={currentUrl}
                      class="img-fluid rounded border h-100 object-fit-cover w-100"
                      style="min-width: 300px; cursor: pointer;"
                      alt="Preview"
                      title="Click to set image URL"
                      onclick={inputImageUrl}
                    />
                  {/if}
                {:else}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="w-100 h-100"
                    style="cursor: pointer;"
                    onclick={inputImageUrl}
                    title="Click to set image URL"
                  >
                    <NoPreview />
                  </div>
                {/if}
              </div>

              {#if fetchedImages.length > 1}
                <div class="d-flex align-items-center justify-content-between px-1">
                  <button
                    class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                    onclick={(e) => {
                      e.stopPropagation();
                      selectedImageIndex =
                        (selectedImageIndex - 1 + fetchedImages.length) % fetchedImages.length;
                      tempPreviewUrl = fetchedImages[selectedImageIndex];
                    }}
                  >
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <span class="text-muted small fw-bold">
                    {selectedImageIndex + 1} / {fetchedImages.length}
                  </span>
                  <button
                    class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                    onclick={(e) => {
                      e.stopPropagation();
                      selectedImageIndex = (selectedImageIndex + 1) % fetchedImages.length;
                      tempPreviewUrl = fetchedImages[selectedImageIndex];
                    }}
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer justify-content-start">
          <div class="flex flex-row flex-grow-1 d-flex gap-2">
            <button
              type="button"
              class="btn btn-secondary d-flex align-items-center gap-1"
              onclick={handleFetch}
              disabled={isFetching || isSaving}
            >
              {#if isFetching}
                <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                <span class="visually-hidden" role="status">Loading...</span>
              {:else}
                <RotateCw size={16} />Fetch Info
              {/if}
            </button>
            {#if tempUrl}
              <button
                type="button"
                class="btn btn-outline-secondary d-flex align-items-center gap-1"
                onclick={handleEditUrl}
                disabled={isFetching || isSaving}
              >
                <Link size={16} />Edit URL
              </button>
            {/if}
          </div>
          <button
            type="button"
            class="btn btn-primary"
            onclick={handleSave}
            disabled={isSaving || isFetching}
          >
            {#if isSaving}
              <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              <span class="visually-hidden" role="status">Saving...</span>
            {:else}
              Save
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style lang="scss">
  .description {
    min-width: 0;
    > div,
    textarea {
      white-space: pre-wrap;
      overflow-y: auto;
      height: 0;
      min-height: 400px;
    }
    :global(img) {
      max-width: 100%;
      height: auto;
      display: block;
    }
  }

  :global(.description .huggingface-gallery) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
    white-space: normal;

    :global(figure) {
      margin: 0;
      padding: 0.5rem;
      border: 1px solid var(--bs-border-color);
      border-radius: var(--bs-border-radius);
      display: flex;
      flex-direction: column;
      height: 100%;

      :global(img) {
        margin-bottom: 0.5rem;
        border-radius: var(--bs-border-radius);
      }

      :global(figcaption) {
        margin-top: auto;
        color: var(--bs-body-color);

        :global(dl) {
          margin-bottom: 0;
          :global(dt) {
            font-weight: bold;
          }
          :global(dd) {
            margin-bottom: 0;
            word-break: break-word;
          }
        }
      }
    }
  }
</style>
