<script lang="ts">
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget } = $props();

  function clickAction() {
    widget.clickComfyUiButton();
    widget.node.updateNode();
  }
</script>

<div class={widget.name} title={widget.tooltip ?? ''}>
  <button
    id={widget.id}
    class="btn btn-sm btn-secondary w-100"
    data-name={widget.name}
    onclick={clickAction}
  >
    {$t(`comfyui.widget.${widget.name}`, {}, widget.label) ?? widget.name}
  </button>
</div>
