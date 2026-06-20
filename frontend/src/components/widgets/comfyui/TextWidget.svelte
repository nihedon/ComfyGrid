<script lang="ts">
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget } = $props();

  function handleInput() {
    widget.updateComfyUiValue();
  }
</script>

<div title={widget.tooltip ?? ''} data-id={widget.id} data-name={widget.name}>
  <label class="col-4 p-0 flex-nowrap text-truncate" for={widget.id}>
    {$t(`comfyui.widget.${widget.name}`, {}, widget.label) ?? widget.name}
  </label>
  <div class="col-8 p-0">
    <input
      id={widget.id}
      class="form-control"
      type="text"
      onchange={handleInput}
      bind:value={widget.value}
    />
  </div>
</div>
