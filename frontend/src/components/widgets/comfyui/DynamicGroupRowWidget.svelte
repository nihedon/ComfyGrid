<script lang="ts">
  import { X } from '@lucide/svelte';
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget<unknown, { disabled?: boolean }> } = $props();

  const label = $derived(widget.label ?? widget.name);
  const disabled = $derived(Boolean(widget.options?.disabled) || !widget.callback);
  const removeLabel = $derived($t('widget.dynamic_group.remove', { row: label }));

  function removeRow() {
    if (disabled) return;
    widget.comfyWidget.callback?.(undefined);
    widget.node.updateNode();
  }
</script>

<div class="dynamic-group-row gap-2 w-100" data-id={widget.id} data-name={widget.name}>
  <span class="flex-grow-1 border-top" aria-hidden="true"></span>
  <span class="text-body-secondary text-truncate">{label}</span>
  <button
    type="button"
    class="btn btn-sm border-0 p-0 d-inline-flex align-items-center justify-content-center flex-shrink-0"
    {disabled}
    aria-label={removeLabel}
    title={removeLabel}
    onclick={removeRow}
  >
    <X size={16} />
  </button>
</div>

<style>
  button {
    color: inherit;
    width: 24px;
    height: 24px;
  }
</style>
