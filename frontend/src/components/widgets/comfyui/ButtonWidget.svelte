<script lang="ts">
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget } = $props();

  function clickAction() {
    widget.clickComfyUiButton();
    widget.node.updateNode();
  }
</script>

<button
  class="btn btn-sm btn-secondary w-100"
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
  onclick={clickAction}
>
  {$t(`comfyui.widget.${widget.name}`, {}, widget.label) ?? widget.name}
</button>
