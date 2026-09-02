<script lang="ts">
  import { Info } from '@lucide/svelte';
  import { comfyGridApiClient } from '@/api/api-client';
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridWidget } from '@/states/model-state.svelte';
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';
  import AutoCompleteForm from './AutoCompleteForm.svelte';
  import ModelListButton from './ModelListButton.svelte';

  type ComboWidget = ComfyGridWidget<
    string | number,
    {
      values: (string | number)[];
      fixed_values: (string | number)[];
    }
  >;

  let {
    widget,
    modelDir,
    modelSubdirs,
    isValidOverride = undefined,
    handleInput,
  }: {
    widget: ComboWidget;
    modelDir: ModelTypes;
    modelSubdirs: string[];
    isValidOverride?: boolean;
    handleInput: (
      e: CustomEvent,
      widget: ComfyGridWidget<string | number, unknown>,
      model?: Model,
    ) => void;
  } = $props();

  let element = $state<HTMLElement>();

  const storageState = appState.storageState;
  const popoverState = appState.popoverState;

  const showNsfw = $derived(appState.optionState.get('ComfyGrid.ui.show_nsfw'));

  const select = $derived(
    (widget.options?.values ?? []).map((v) => String(v)) as readonly string[],
  );

  const filteredSelect = $derived.by(() => {
    if (showNsfw || !modelDir || !modelSubdirs) {
      return select;
    }
    return select.filter((path) => {
      const model = storageState.findModel(modelDir, modelSubdirs, path);
      if (model?.nsfw === true) return false;
      return true;
    });
  });

  const currentModel = $derived.by(() => {
    if (!modelDir || !modelSubdirs || !widget.value) return null;
    return storageState.findModel(modelDir, modelSubdirs, String(widget.value));
  });

  const hasDescription = $derived(
    Boolean(currentModel?.has_description || currentModel?.description),
  );

  async function handleDescriptionClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentModel) return;

    if (!currentModel.retrieved) {
      const res = await comfyGridApiClient.getModelInfo(currentModel.full_path);
      if (res.ok && res.json) {
        if (res.json.description) {
          currentModel.description = res.json.description;
        }
        currentModel.retrieved = true;
      }
    }

    appState.descriptionModalState.show(currentModel, modelSubdirs ?? []);
  }

  function handleMouseEnter() {
    if (modelDir !== 'models') {
      return;
    }
    const model = storageState.findModel(modelDir, modelSubdirs, String(widget.value ?? ''));
    if (model && element && (showNsfw || !model.nsfw)) {
      popoverState.showModelPopover(element, model, modelDir);
    }
  }

  function handleMouseLeave() {
    if (modelDir !== 'models') {
      return;
    }
    popoverState.hidePopover();
  }
</script>

<div
  class="input-group"
  role="group"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  bind:this={element}
>
  <div class="auto-complete-form-container">
    <AutoCompleteForm
      {widget}
      select={filteredSelect}
      {modelDir}
      {modelSubdirs}
      {isValidOverride}
      {handleInput}
    />
    {#if hasDescription}
      <!-- svelte-ignore a11y_invalid_attribute -->
      <a
        href="#"
        class="model-info-icon-btn"
        onclick={handleDescriptionClick}
        title="Show description"
      >
        <Info size={14} />
      </a>
    {/if}
  </div>
  <ModelListButton {widget} {select} {modelDir} {modelSubdirs} {handleInput} />
</div>

<style lang="scss">
  .input-group {
    flex-wrap: nowrap !important;
  }
  .auto-complete-form-container {
    position: relative;
    flex-grow: 1;
    display: flex;
    align-items: center;
    :global(input.form-control) {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
  }
</style>
