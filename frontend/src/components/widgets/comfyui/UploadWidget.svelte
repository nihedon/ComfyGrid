<script lang="ts">
  import { FolderOpen } from '@lucide/svelte';
  import { ComfyGridWidget } from '@/states/model-state.svelte';
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';
  import ModalComboWidget from './features/ModalComboWidget.svelte';

  type ComboWidget = ComfyGridWidget<
    string,
    {
      values: string[];
      fixed_values: string[];
    }
  >;

  let { widget }: { widget: ComboWidget } = $props();

  const modelDir = $derived.by<ModelTypes>(() => {
    const name = widget.name.toLowerCase();
    if (name.includes('video')) {
      return 'videos';
    }
    return 'images';
  });

  function handleInput(e: CustomEvent, widget: ComfyGridWidget<string, unknown>, model?: Model) {
    if (model) {
      widget.value = model.path;
    } else {
      widget.value = e.detail.value;
    }
    widget.updateSelect();
    widget.onDrawBackground();
  }
</script>

<div title={widget.tooltip ?? ''} data-id={widget.id} data-name={widget.name}>
  <div class="d-flex flex-grow-1 gap-2">
    <ModalComboWidget {widget} {modelDir} modelSubdirs={[]} {handleInput} />
    <button class="btn btn-primary btn-sm btn-icon" onclick={() => widget.callback()}>
      <FolderOpen size={16} />
    </button>
  </div>
</div>
