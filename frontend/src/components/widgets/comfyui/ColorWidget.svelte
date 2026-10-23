<script lang="ts">
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget<string | number, { format?: string }> } = $props();

  const colorValue = $derived.by(() => {
    if (typeof widget.value === 'number') {
      const value = Number.isFinite(widget.value)
        ? Math.max(0, Math.min(0xffffff, Math.round(widget.value)))
        : 0;
      return `#${value.toString(16).padStart(6, '0')}`;
    }
    const value = widget.value?.trim() ?? '';
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(value)) {
      return `#${value
        .slice(1)
        .split('')
        .map((digit) => digit + digit)
        .join('')}`.toLowerCase();
    }
    return '#000000';
  });

  function handleInput(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    widget.value =
      typeof widget.value === 'number' || widget.options?.format === 'int'
        ? parseInt(value.slice(1), 16)
        : value;
  }

  function handleChange(event: Event) {
    handleInput(event);
    widget.updateValue();
  }
</script>

<div title={widget.tooltip ?? ''} data-id={widget.id} data-name={widget.name}>
  <label class="col-4 p-0 flex-nowrap text-truncate" for={widget.id}>
    {$t(`comfyui.widget.${widget.name}`, {}, widget.label) ?? widget.name}
  </label>
  <div class="col-8 p-0 d-flex align-items-center justify-content-end gap-2">
    <output class="font-monospace text-uppercase" for={widget.id}>{colorValue}</output>
    <input
      id={widget.id}
      class="form-control form-control-sm form-control-color flex-shrink-0"
      type="color"
      value={colorValue}
      disabled={widget.readonly}
      oninput={handleInput}
      onchange={handleChange}
    />
  </div>
</div>
