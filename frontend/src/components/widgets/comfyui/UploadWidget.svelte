<script lang="ts">
  import { ComfyGridWidget } from '@/states/model-state.svelte';
  import type { Model } from '@/states/storage-state.svelte';
  import ModalComboWidget from './features/ModalComboWidget.svelte';

  type ComboWidget = ComfyGridWidget<
    string,
    {
      values: string[];
      fixed_values: string[];
    }
  >;

  let { widget }: { widget: ComboWidget } = $props();

  function handleInput(e: CustomEvent, widget: ComfyGridWidget<string, unknown>, model?: Model) {
    if (model) {
      widget.value = model.path;
    } else {
      widget.value = e.detail.value;
    }
    widget.updateComfyUiSelect();
    widget.node.drawBackground();
  }
</script>

<div title={widget.tooltip ?? ''} data-id={widget.id} data-name={widget.name}>
  <div class="d-flex flex-grow-1 gap-2">
    <ModalComboWidget {widget} modelDir="images" modelSubdirs={[]} {handleInput} />
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button class="btn btn-primary btn-sm p-2" onclick={() => widget.callback()}>
      <i class="pi pi-folder-open"></i>
    </button>
  </div>
</div>
