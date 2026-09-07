<script lang="ts">
  import { AppWindow } from '@lucide/svelte';
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridWidget } from '@/states/model-state.svelte';
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';

  let {
    widget,
    select,
    modelDir,
    modelSubdirs,
    handleInput,
  }: {
    widget: ComfyGridWidget<string | number, unknown>;
    select?: Iterable<string>;
    modelDir: ModelTypes;
    modelSubdirs: string[];
    handleInput?: (
      e: CustomEvent,
      widget: ComfyGridWidget<string | number, unknown>,
      model: Model,
    ) => void;
  } = $props();

  const modalState = appState.modalState;

  const valueSet = $derived(select ? new Set(select) : null);

  function openModelModal() {
    modalState.setup(
      String(widget.value ?? ''),
      modelDir,
      modelSubdirs,
      valueSet,
      (model: Model) => {
        handleInput?.(new CustomEvent('modal'), widget, model);
      },
    );
  }
</script>

<button
  id={widget.id}
  type="button"
  class="btn btn-sm btn-secondary btn-icon"
  onclick={() => openModelModal()}
  aria-label="Select model"
>
  <AppWindow size={16} strokeWidth={1.25} />
</button>
