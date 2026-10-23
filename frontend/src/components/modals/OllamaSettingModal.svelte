<script lang="ts">
  import { untrack } from 'svelte';
  import { Loader2, RotateCw, Settings, TriangleAlert } from '@lucide/svelte';
  import { Modal } from 'bootstrap';
  import { comfyGridApiClient } from '@/api/api-client';
  import { t } from '@/i18n/i18n';
  import { saveLayoutObject } from '@/services/gridstack-service';
  import { saveOptsWithCallback } from '@/services/options-service';
  import { appState } from '@/states/app-state.svelte';
  import type { TranslationSeedMode } from '@/types/layout';

  let modalElement = $state<HTMLDivElement>();
  let bsModal: Modal | null = null;
  let isSaving = $state(false);

  const optionState = appState.optionState;
  const workspaceState = appState.workspaceState;
  const layout = $derived(workspaceState.layout);

  let model = $state('');
  let system = $state('');
  let seedMode = $state<TranslationSeedMode>('fixed');
  let useGlobalModel = $state(true);
  let useGlobalSystem = $state(true);
  let useGlobalSeedMode = $state(true);

  let models = $state<string[]>([]);
  let modelSizes = $state<Record<string, number | null>>({});
  let hasLoadedModels = false;
  let loadingModels = $state(false);
  let isAvailable = $state(true);
  let modelLoadFailed = $state(false);
  let modelLoadError = $state('');

  const modalState = appState.ollamaSettingModalState;

  async function fetchModels() {
    if (loadingModels) return;
    loadingModels = true;
    hasLoadedModels = false;
    modelLoadFailed = false;
    modelLoadError = '';
    try {
      const res = await comfyGridApiClient.getLlmStatus();
      if (!res.ok) {
        const detail = typeof res.json?.detail === 'string' ? res.json.detail : '';
        throw new Error([`HTTP ${res.status}`, detail].filter(Boolean).join(': '));
      }
      if (
        typeof res.json?.available !== 'boolean' ||
        !Array.isArray(res.json.models) ||
        !res.json.models.every((name) => typeof name === 'string' && name.trim() !== '')
      ) {
        throw new Error('Invalid Ollama model list response.');
      }
      models = [...new Set(res.json.models)];
      modelSizes = res.json.model_sizes ?? {};
      isAvailable = res.json.available && models.length > 0;
      hasLoadedModels = isAvailable;
      if (!model && models.length > 0) {
        model = models[0];
      }
    } catch (e) {
      console.error('Failed to fetch LLM status:', e);
      isAvailable = false;
      models = [];
      modelSizes = {};
      modelLoadFailed = true;
      modelLoadError = e instanceof Error ? e.message : '';
    } finally {
      loadingModels = false;
    }
  }

  function formatModelSize(size: number | null | undefined): string {
    if (size == null || !Number.isFinite(size) || size < 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unit =
      size === 0 ? 0 : Math.min(Math.floor(Math.log(size) / Math.log(1000)), units.length - 1);
    return `${(size / 1000 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
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
      const customSeedMode = layout.getTranslateSeedMode(wId);

      useGlobalModel = !customModel;
      useGlobalSystem = !customSystem;
      useGlobalSeedMode = !customSeedMode;

      model = customModel ?? optionState.get('ComfyGrid.ollama.model') ?? '';
      system = customSystem ?? optionState.get('ComfyGrid.ollama.system') ?? '';
      seedMode = customSeedMode ?? optionState.get('ComfyGrid.ollama.seed_mode') ?? 'fixed';
      untrack(() => {
        if (!hasLoadedModels) {
          void fetchModels();
        } else if (!model && models.length > 0) {
          model = models[0];
        }
      });
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

    if (useGlobalSeedMode) {
      layout.setTranslateSeedMode(wId, '');
      if (seedMode !== (optionState.get('ComfyGrid.ollama.seed_mode') ?? 'fixed')) {
        optionState.set('ComfyGrid.ollama.seed_mode', seedMode);
        globalChanged = true;
      }
    } else {
      layout.setTranslateSeedMode(wId, seedMode);
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
          <Settings size={18} /> Ollama Settings
        </h5>
        <button type="button" class="btn-close" aria-label="Close" onclick={handleClose}></button>
      </div>
      <div class="modal-body vstack gap-3">
        {#if !isAvailable && !loadingModels}
          <div class="alert alert-warning d-flex align-items-center gap-2 mb-0" role="alert">
            <TriangleAlert size={18} class="flex-shrink-0" />
            <div>
              {$t(modelLoadFailed ? 'warn.ollama.models_fetch_failed' : 'warn.ollama.no_models')}
              {#if modelLoadError}
                <div class="small text-break mt-1">{modelLoadError}</div>
              {/if}
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
                <option value="" disabled>
                  {$t(modelLoadFailed ? 'ollama.models_fetch_failed' : 'ollama.no_models')}
                </option>
              {:else if models.length === 0 && !loadingModels}
                <option value="" disabled>No models found</option>
              {:else}
                {#each models as m (m)}
                  <option value={m}
                    >{m}{modelSizes[m] != null
                      ? ` (${formatModelSize(modelSizes[m])})`
                      : ''}</option
                  >
                {/each}
              {/if}
            </select>
            <button
              class="btn btn-outline-secondary d-flex align-items-center justify-content-center"
              type="button"
              onclick={fetchModels}
              disabled={loadingModels}
              title={$t('menu.reload') ?? 'Reload'}
            >
              <RotateCw size={16} class={loadingModels ? 'spin' : ''} />
            </button>
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
            rows="12"
            bind:value={system}
            placeholder="e.g. Translate the user input into English. Output ONLY the translated text."
          ></textarea>
        </div>

        <div>
          <div class="d-flex align-items-center justify-content-between mb-1">
            <label for="ollama-seed-mode" class="form-label mb-0">
              {$t('opts.ComfyGrid.ollama.seed_mode.label')}
            </label>
            <div class="form-check form-check-inline mb-0">
              <input
                class="form-check-input"
                type="checkbox"
                id="use-global-seed-mode"
                bind:checked={useGlobalSeedMode}
                onchange={() => {
                  if (useGlobalSeedMode) {
                    seedMode = optionState.get('ComfyGrid.ollama.seed_mode') ?? 'fixed';
                  }
                }}
              />
              <label class="form-check-label small" for="use-global-seed-mode">
                {$t('ollama.use_global')}
              </label>
            </div>
          </div>
          <select id="ollama-seed-mode" class="form-select" bind:value={seedMode}>
            {#each ['fixed', 'random'] as mode (mode)}
              <option value={mode}>
                {$t(`opts.ComfyGrid.ollama.seed_mode.choice.${mode}`)}
              </option>
            {/each}
          </select>
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
            <Loader2 size={16} class="spin" />
          {/if}
          Save
        </button>
      </div>
    </div>
  </div>
</div>
