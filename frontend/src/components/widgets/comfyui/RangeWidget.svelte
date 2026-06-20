<script lang="ts">
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  type RangeWidget = ComfyGridWidget<
    number,
    {
      min: number;
      max: number;
      step: number;
    }
  >;

  let { widget }: { widget: RangeWidget } = $props();

  function handleInput() {
    widget.updateComfyUiValue();
  }

  function handleChange() {
    widget.updateComfyUiValue();
  }
</script>

<div title={widget.tooltip ?? ''} data-id={widget.id} data-name={widget.name}>
  <label class="col-4 p-0 flex-nowrap text-truncate" for={widget.id}>
    {$t(`comfyui.widget.${widget.name}`, {}, widget.label) ?? widget.name}
  </label>
  <div class="col-8 p-0 d-flex gap-2 align-items-center">
    <input
      id={widget.id}
      class="form-range"
      type="range"
      min={widget.options.min}
      max={widget.options.max}
      step={widget.options.step}
      oninput={handleInput}
      bind:value={widget.value}
    />
    <!-- 数値入力欄を追加 -->
    <input
      class="form-control p-1 text-end"
      type="number"
      style="width: 5.2rem;"
      min={widget.options.min}
      max={widget.options.max}
      step={widget.options.step}
      onchange={handleChange}
      bind:value={widget.value}
    />
  </div>
</div>
