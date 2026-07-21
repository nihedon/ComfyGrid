<script lang="ts">
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
      .filter((image: Record<string, string>) => image.type === 'image' && image.url)
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
        const parts = model.full_path.split(/[/\\]/);
        parts.shift();
        model.preview = parts.join('/').replace(model.extension, '.preview.png');
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
</script>

<div class="modal fade" tabindex="-1" aria-hidden="true" bind:this={modalElement}>
  <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
    <div class="modal-content">
      {#if model}
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_role_has_required_aria_props -->
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <i
              class="pi pi-heart{tempFavorite ? '-fill text-warning' : ''}"
              style="cursor: pointer;"
              role="switch"
              onclick={() => (tempFavorite = !tempFavorite)}
            ></i>
            {model.name}
            {#if tempUrl}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <i
                class="pi pi-link fs-5"
                style="cursor: pointer;"
                onclick={() => window.open(tempUrl, '_blank')}
              ></i>
            {/if}
          </h5>
          <button type="button" class="btn-close" aria-label="Close" onclick={handleClose}></button>
        </div>
        <div class="modal-body">
          <div class="d-flex gap-3">
            <div class="vstack flex-grow-1">
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
                    <i
                      class="pi pi-star{tempRate && tempRate >= star
                        ? '-fill text-warning'
                        : ''} fs-4 me-1"
                      style="cursor: pointer;"
                      onclick={() => (tempRate = tempRate === star ? undefined : star)}
                    ></i>
                  {/each}
                </div>
              </div>
              <div class="mb-1 vstack flex-grow-1 description">
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label class="fs-5 mb-0 form-label fw-bold d-flex align-items-center gap-2"
                  >Description
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <i
                    class="pi pi-file-edit fs-5 text-secondary"
                    style="cursor: pointer;"
                    onclick={() => (isEditingDescription = !isEditingDescription)}
                  ></i>
                </label>
                {#if isEditingDescription}
                  <textarea
                    class="form-control flex-grow-1 font-monospace"
                    rows="10"
                    bind:value={tempDescription}
                  ></textarea>
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
                        <!-- svelte-ignore a11y_consider_explicit_label -->
                        <button
                          class="btn btn-secondary"
                          type="button"
                          onclick={() => {
                            tempTrainedWords.splice(i, 1);
                          }}
                        >
                          <i class="pi pi-times"></i>
                        </button>
                      </div>
                    {/each}
                  {/if}
                  <button
                    class="btn btn-sm btn-primary mt-1"
                    onclick={() => {
                      tempTrainedWords.push('');
                    }}
                  >
                    <i class="pi pi-plus me-1"></i>Add Word
                  </button>
                </div>
              {/if}
            </div>
            <div class="d-flex flex-column gap-2" style="width: 300px; min-width: 300px;">
              <div style="height: 400px;">
                {#if model.preview || tempPreviewUrl}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                  <img
                    src={tempPreviewUrl ||
                      `/comfygrid/api/thumbnail=${model.preview}?t=${model.modified}`}
                    class="img-fluid rounded border h-100 object-fit-cover w-100"
                    style="min-width: 300px; cursor: pointer;"
                    alt="Preview"
                    title="Click to set image URL"
                    onclick={inputImageUrl}
                  />
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
              
              {#if fetchedImages.length > 1 && fetchedImages.includes(tempPreviewUrl || '')}
                <div class="d-flex align-items-center justify-content-between px-1">
                  <button
                    class="btn btn-sm btn-outline-secondary"
                    onclick={(e) => {
                      e.stopPropagation();
                      selectedImageIndex = (selectedImageIndex - 1 + fetchedImages.length) % fetchedImages.length;
                      tempPreviewUrl = fetchedImages[selectedImageIndex];
                    }}
                  >
                    <i class="pi pi-chevron-left"></i> Prev
                  </button>
                  <span class="text-muted small fw-bold">
                    {selectedImageIndex + 1} / {fetchedImages.length}
                  </span>
                  <button
                    class="btn btn-sm btn-outline-secondary"
                    onclick={(e) => {
                      e.stopPropagation();
                      selectedImageIndex = (selectedImageIndex + 1) % fetchedImages.length;
                      tempPreviewUrl = fetchedImages[selectedImageIndex];
                    }}
                  >
                    Next <i class="pi pi-chevron-right"></i>
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
              class="btn btn-secondary"
              onclick={handleFetch}
              disabled={isFetching || isSaving}
            >
              {#if isFetching}
                <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                <span class="visually-hidden" role="status">Loading...</span>
              {:else}
                <i class="pi pi-refresh me-1"></i>Fetch Info
              {/if}
            </button>
            {#if tempUrl}
              <button
                type="button"
                class="btn btn-outline-secondary"
                onclick={handleEditUrl}
                disabled={isFetching || isSaving}
              >
                <i class="pi pi-link me-1"></i>Edit URL
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
