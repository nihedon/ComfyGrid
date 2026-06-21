<script lang="ts">
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  type NumberWidget = ComfyGridWidget<
    number,
    {
      min: number;
      max: number;
      step: number;
      step2: number;
    }
  >;

  let { widget }: { widget: NumberWidget } = $props();

  const displayValue = $derived(widget.value);

  const minAndMaxAttr = $derived.by(() => {
    let minAndMaxAttr: { min?: number; max?: number } = {};
    if (widget?.options?.min >= -Number.MAX_SAFE_INTEGER) {
      const step = widget?.options?.step2 ?? widget?.options?.step ?? 1;
      if (widget.options.min % step !== 0) {
        if (widget.options.min > 0) {
          minAndMaxAttr['min'] = 0;
        }
      } else {
        minAndMaxAttr['min'] = widget.options.min;
      }
    }
    if (widget?.options?.max <= Number.MAX_SAFE_INTEGER) {
      minAndMaxAttr['max'] = widget.options.max;
    }
    return minAndMaxAttr;
  });

  function handleInput(e: Event) {
    let rawValue = parseFloat((e.target as HTMLInputElement).value);
    if (isNaN(rawValue)) {
      return;
    }
    if (rawValue < widget.options.min) {
      widget.value = widget.options.min;
      return;
    }
    const step = widget?.options?.step2 ?? widget?.options?.step ?? 1;
    if (widget.options.min != 0 && widget.options.min % step !== 0) {
      if (rawValue < widget.options.min) {
        widget.value = widget.options.min;
        return;
      } else {
        let correctedValue = Math.round(rawValue / step) * step;
        widget.value = parseFloat(correctedValue.toFixed(6));
        return;
      }
    }
    widget.value = rawValue;
  }

  function handleChange() {
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
      type="number"
      value={displayValue}
      {...minAndMaxAttr}
      step={widget?.options?.step2 ?? widget?.options?.step ?? undefined}
      onchange={handleChange}
      oninput={handleInput}
    />
  </div>
</div>
