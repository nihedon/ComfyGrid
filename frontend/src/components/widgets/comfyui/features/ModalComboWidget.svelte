<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';
  import AutoCompleteForm from './AutoCompleteForm.svelte';
  import ModelListButton from './ModelListButton.svelte';

  let {
    node,
    widget,
    select,
    isValid,
    modelDir,
    modelSubdirs,
    handleInput,
  }: {
    node: ComfyGridNode;
    widget: ComfyGridWidget<string, unknown>;
    select: string[];
    isValid: boolean;
    modelDir: ModelTypes;
    modelSubdirs: string[];
    handleInput: (e: CustomEvent, widget: ComfyGridWidget<string, unknown>, model?: Model) => void;
  } = $props();

  let element = $state<HTMLElement>();

  const storageState = appState.storageState;
  const popoverState = appState.popoverState;

  function handleMouseEnter() {
    if (modelDir !== 'models') {
      return;
    }
    const model = storageState.findModelByPath(widget.value);
    if (model && element) {
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
  <AutoCompleteForm {node} {widget} {select} {isValid} {handleInput} />
  <ModelListButton {widget} {select} {modelDir} {modelSubdirs} {handleInput} />
</div>
