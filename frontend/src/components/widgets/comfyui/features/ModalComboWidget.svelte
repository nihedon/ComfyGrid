<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridWidget } from '@/states/model-state.svelte';
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';
  import AutoCompleteForm from './AutoCompleteForm.svelte';
  import ModelListButton from './ModelListButton.svelte';

  type ComboWidget = ComfyGridWidget<
    string,
    {
      values: string[];
      fixed_values: string[];
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
    handleInput: (e: CustomEvent, widget: ComfyGridWidget<string, unknown>, model?: Model) => void;
  } = $props();

  let element = $state<HTMLElement>();

  const storageState = appState.storageState;
  const popoverState = appState.popoverState;

  const showNsfw = $derived(
    appState.optionState.opts.get('show_nsfw') ??
      appState.optionState.forms.get('show_nsfw')?.default,
  );

  const select = $derived(widget.options?.values ?? []);

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

  function handleMouseEnter() {
    if (modelDir !== 'models') {
      return;
    }
    const model = storageState.findModel(modelDir, modelSubdirs, widget.value);
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
  <AutoCompleteForm
    {widget}
    select={filteredSelect}
    {modelDir}
    {modelSubdirs}
    {isValidOverride}
    {handleInput}
  />
  <ModelListButton {widget} {select} {modelDir} {modelSubdirs} {handleInput} />
</div>
