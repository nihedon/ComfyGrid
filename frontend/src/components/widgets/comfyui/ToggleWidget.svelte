<script lang="ts">
  import { t } from '@/i18n/i18n';
  import { ComfyGridWidget } from '@/states/model-state.svelte';

  type ToggleWidget = ComfyGridWidget<boolean>;

  let { widget }: { widget: ToggleWidget } = $props();

  function handleInput() {
    widget.updateComfyUiValue();
    widget.node.drawBackground();
  }
</script>

<div data-name={widget.name} title={widget.tooltip ?? ''}>
  <label class="col-4 p-0 flex-nowrap text-truncate" for={widget.id}>
    {$t(`comfyui.widget.${widget.name}`, {}, widget.label) ?? widget.name}
  </label>
  <div class="form-switch col-8 p-0 form-check d-flex justify-content-end">
    <input
      id={widget.id}
      class="form-check-input"
      type="checkbox"
      data-name={widget.name}
      onchange={handleInput}
      bind:checked={widget.value}
    />
  </div>
</div>
