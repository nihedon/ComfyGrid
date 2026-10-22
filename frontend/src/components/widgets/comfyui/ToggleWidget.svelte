<script lang="ts">
  import { t } from '@/i18n/i18n';
  import { ComfyGridWidget } from '@/states/model-state.svelte';

  type ToggleWidget = ComfyGridWidget<boolean, { on?: unknown; off?: unknown }>;

  let { widget }: { widget: ToggleWidget } = $props();

  const hasButtonLabels = $derived(
    typeof widget.options?.on === 'string' || typeof widget.options?.off === 'string',
  );
  const onLabel = $derived(typeof widget.options?.on === 'string' ? widget.options.on : 'ON');
  const offLabel = $derived(typeof widget.options?.off === 'string' ? widget.options.off : 'OFF');
  const displayLabel = $derived(
    $t(`comfyui.widget.${widget.name}`, {}, widget.label) ?? widget.name,
  );

  function handleInput() {
    widget.updateValue();
    widget.onDrawBackground();
  }

  function selectValue(value: boolean) {
    if (widget.readonly || widget.value === value) return;
    widget.value = value;
    handleInput();
  }
</script>

<div title={widget.tooltip ?? ''} data-id={widget.id} data-name={widget.name}>
  {#if hasButtonLabels}
    <span class="col-4 p-0 flex-nowrap text-truncate" title={displayLabel}>{displayLabel}</span>
    <div class="btn-group toggle-options col-8 p-0" role="group" aria-label={displayLabel}>
      <button
        type="button"
        class="btn btn-sm toggle-choice"
        class:btn-primary={widget.value === false}
        class:btn-secondary={widget.value !== false}
        aria-pressed={widget.value === false}
        disabled={widget.readonly}
        onclick={() => selectValue(false)}>{offLabel}</button
      >
      <button
        type="button"
        class="btn btn-sm toggle-choice"
        class:btn-primary={widget.value === true}
        class:btn-secondary={widget.value !== true}
        aria-pressed={widget.value === true}
        disabled={widget.readonly}
        onclick={() => selectValue(true)}>{onLabel}</button
      >
    </div>
  {:else}
    <label class="col-4 p-0 flex-nowrap text-truncate" for={widget.id}>
      {displayLabel}
    </label>
    <div class="form-switch col-8 p-0 form-check d-flex justify-content-end">
      <input
        id={widget.id}
        class="form-check-input"
        type="checkbox"
        onchange={handleInput}
        bind:checked={widget.value}
      />
    </div>
  {/if}
</div>

<style>
  .toggle-options > .toggle-choice {
    flex: 1 1 0;
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }
</style>
