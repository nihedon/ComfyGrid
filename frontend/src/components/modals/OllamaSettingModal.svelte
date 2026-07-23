<script lang="ts">
  import { Modal } from 'bootstrap';
  import { comfyGridApiClient } from '@/api/api-client';
  import { t } from '@/i18n/i18n';
  import { saveLayoutObject } from '@/services/gridstack-service';
  import { saveOptsWithCallback } from '@/services/options-service';
  import { appState } from '@/states/app-state.svelte';

  let modalElement = $state<HTMLDivElement>();
  let bsModal: Modal | null = null;
  let isSaving = $state(false);

  const optionState = appState.optionState;
  const workspaceState = appState.workspaceState;
  const layout = $derived(workspaceState.layout);

  let model = $state('');
  let system = $state('');
  let useGlobalModel = $state(true);
  let useGlobalSystem = $state(true);

  let models = $state<string[]>([]);
  let loadingModels = $state(false);
  let isAvailable = $state(true);

  const modalState = appState.ollamaSettingModalState;

  async function fetchModels() {
    loadingModels = true;
    try {
      const res = await comfyGridApiClient.getLlmStatus();
      if (res.ok && res.json) {
        isAvailable = res.json.available;
        models = res.json.models;
        if (!model && models.length > 0) {
          model = models[0];
        }
      } else {
        isAvailable = false;
        models = [];
      }
    } catch (e) {
      console.error('Failed to fetch LLM status:', e);
      isAvailable = false;
      models = [];
    } finally {
      loadingModels = false;
    }
  }

  $effect(() => {
    if (!modalElement) return;
    bsModal = Modal.getOrCreateInstance(modalElement);

    const handleHidden = () => {
      modalState.close();
    };
    modalElement.addEventListener('hidden.bs.modal', handleHidden);
    return () => {
      modalElement!.removeEventListener('hidden.bs.modal', handleHidden);
    };
  });

  $effect(() => {
    if (!bsModal) return;
    if (modalState.isOpen && modalState.widgetId) {
      const wId = modalState.widgetId;
      const customModel = layout.getTranslateModel(wId);
      const customSystem = layout.getTranslateSystem(wId);

      useGlobalModel = !customModel;
      useGlobalSystem = !customSystem;

      model = customModel ?? optionState.get('ComfyGrid.ollama.model') ?? '';
      system = customSystem ?? optionState.get('ComfyGrid.ollama.system') ?? '';
      fetchModels();
      bsModal.show();
    } else {
      bsModal.hide();
    }
  });

  async function handleSave() {
    if (!modalState.widgetId) return;
    isSaving = true;
    const wId = modalState.widgetId;
    let globalChanged = false;

    if (useGlobalModel) {
      optionState.set('ComfyGrid.ollama.model', model);
      layout.setTranslateModel(wId, '');
      globalChanged = true;
    } else {
      layout.setTranslateModel(wId, model);
    }

    if (useGlobalSystem) {
      optionState.set('ComfyGrid.ollama.system', system);
      layout.setTranslateSystem(wId, '');
      globalChanged = true;
    } else {
      layout.setTranslateSystem(wId, system);
    }

    if (globalChanged) {
      saveOptsWithCallback();
    }
    saveLayoutObject(layout);

    isSaving = false;
    modalState.close();
  }

  function handleClose() {
    modalState.close();
  }
</script>

<div class="modal" tabindex="-1" aria-hidden="true" bind:this={modalElement}>
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title d-flex align-items-center gap-2">
          <i class="pi pi-cog"></i> Ollama Settings
        </h5>
        <button type="button" class="btn-close" aria-label="Close" onclick={handleClose}></button>
      </div>
      <div class="modal-body vstack gap-3">
        {#if !isAvailable && !loadingModels}
          <div class="alert alert-warning d-flex align-items-center gap-2 mb-0" role="alert">
            <i class="pi pi-exclamation-triangle flex-shrink-0"></i>
            <div>
              {$t('warn.ollama.not_available')}
            </div>
          </div>
        {/if}

        <div>
          <div class="d-flex align-items-center justify-content-between mb-1">
            <label for="ollama-model" class="form-label mb-0">{$t('menu.ollama.model')}</label>
            <div class="form-check form-check-inline mb-0">
              <input
                class="form-check-input"
                type="checkbox"
                id="use-global-model"
                bind:checked={useGlobalModel}
                onchange={() => {
                  if (useGlobalModel) {
                    model = optionState.get('ComfyGrid.ollama.model') ?? '';
                  }
                }}
              />
              <label class="form-check-label small" for="use-global-model">
                {$t('ollama.use_global')}
              </label>
            </div>
          </div>
          <div class="input-group">
            <select
              id="ollama-model"
              class="form-select"
              bind:value={model}
              disabled={loadingModels || !isAvailable}
            >
              {#if !isAvailable}
                <option value="" disabled>Ollama is unavailable</option>
              {:else if models.length === 0 && !loadingModels}
                <option value="" disabled>No models found</option>
              {:else}
                {#each models as m (m)}
                  <option value={m}>{m}</option>
                {/each}
              {/if}
            </select>
            {#if isAvailable}
              <button
                class="btn btn-outline-secondary d-flex align-items-center justify-content-center"
                type="button"
                onclick={fetchModels}
                disabled={loadingModels}
                title={$t('tab.comfyui.reload') ?? 'Reload'}
              >
                <i class="pi pi-refresh" class:pi-spin={loadingModels}></i>
              </button>
            {/if}
          </div>
        </div>

        <div>
          <div class="d-flex align-items-center justify-content-between mb-1">
            <label for="ollama-system" class="form-label mb-0">{$t('menu.ollama.system')}</label>
            <div class="form-check form-check-inline mb-0">
              <input
                class="form-check-input"
                type="checkbox"
                id="use-global-system"
                bind:checked={useGlobalSystem}
                onchange={() => {
                  if (useGlobalSystem) {
                    system = optionState.get('ComfyGrid.ollama.system') ?? '';
                  }
                }}
              />
              <label class="form-check-label small" for="use-global-system">
                {$t('ollama.use_global')}
              </label>
            </div>
          </div>
          <textarea
            id="ollama-system"
            class="form-control"
            rows="4"
            bind:value={system}
            placeholder="e.g. Translate the user input into English. Output ONLY the translated text."
          ></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancel</button>
        <button
          type="button"
          class="btn btn-primary d-flex align-items-center gap-2"
          onclick={handleSave}
          disabled={isSaving}
        >
          {#if isSaving}
            <i class="pi pi-spin pi-spinner"></i>
          {/if}
          Save
        </button>
      </div>
    </div>
  </div>
</div>
