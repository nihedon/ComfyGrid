<script lang="ts">
  import { Modal } from 'bootstrap';
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
  const metadata = $derived({
    id: '',
    modelId: '',
    model: { nsfw: false },
    trainedWords: [] as string[],
    ...model?.metadata,
  });

  let tempPreviewUrl = $state<string | undefined>();
  let tempDescription = $state('');
  let tempNsfw = $state(false);
  let tempRate = $state<number | undefined>();
  let tempFavorite = $state(false);
  let tempTrainedWords = $state<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchedMetadata = $state<any>(null);

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
      tempNsfw = metadata?.model?.nsfw ?? false;
      tempRate = model.rate;
      tempFavorite = model.favorite ?? false;
      tempTrainedWords = [...(metadata?.trainedWords ?? [])];
      fetchedMetadata = null;
      bsModal.show();
    } else {
      bsModal.hide();
    }
  });

  function handleClose() {
    descriptionState.close();
  }

  async function handleFetch() {
    if (!model?.metadata?.id) return;
    const id = metadata?.id;
    isFetching = true;
    try {
      const res = await fetch(`https://civitai.red/api/v1/model-versions/${id}`);
      if (!res.ok) throw new Error('Failed to fetch from Civitai');
      const data = await res.json();

      if (!data.model) data.model = { nsfw: false };
      if (!data.trainedWords) data.trainedWords = [];

      const imgUrl = (data.images ?? [{}]).filter(
        (image: Record<string, string>) => image.type === 'image',
      )?.[0]?.url;
      if (imgUrl) {
        tempPreviewUrl = imgUrl;
      }

      fetchedMetadata = data;
      tempNsfw = data.model?.nsfw ?? false;
      tempTrainedWords = [...(data.trainedWords ?? [])];
    } catch (e) {
      console.error(e);
      alert(e);
    } finally {
      isFetching = false;
    }
  }

  async function handleSave() {
    if (!model) return;
    isSaving = true;
    try {
      const payloadMetadata = $state.snapshot(fetchedMetadata || metadata || {});
      if (!payloadMetadata.model) payloadMetadata.model = {};
      payloadMetadata.model.nsfw = tempNsfw;
      payloadMetadata.trainedWords = [...tempTrainedWords];

      const payload = {
        metadata: payloadMetadata,
        description: tempDescription,
        rate: tempRate,
        favorite: tempFavorite,
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
      model.rate = tempRate;
      model.favorite = tempFavorite;
      model.metadata = payload.metadata;
      model.has_metadata = true;
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
              <div class="mb-1 vstack flex-grow-1">
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label class="mb-0 form-label fw-bold">Description</label>
                <textarea
                  class="form-control flex-grow-1 font-monospace"
                  rows="10"
                  bind:value={tempDescription}
                ></textarea>
              </div>
              {#if !['checkpoints', 'unet', 'diffusion_models'].some((o) => subdirs.includes(o))}
                <div class="d-flex flex-column">
                  <!-- svelte-ignore a11y_label_has_associated_control -->
                  <label class="mb-0 form-label fw-bold">Trained Words</label>
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
            <div style="width: 300px; height: 400px;">
              {#if model.preview || tempPreviewUrl}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <img
                  src={tempPreviewUrl ||
                    `/comfygrid/api/thumbnail=${model.preview}?t=${model.modified}`}
                  class="img-fluid rounded border h-100 object-fit-cover"
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
          </div>
        </div>
        <div class="modal-footer justify-content-start">
          <div class="flex flex-row flex-grow-1">
            {#if metadata.id}
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
