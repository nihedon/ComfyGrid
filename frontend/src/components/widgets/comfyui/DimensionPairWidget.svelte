<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ArrowDownUp } from '@lucide/svelte';
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let {
    first,
    second,
    children,
  }: {
    first: ComfyGridWidget<unknown, unknown>;
    second: ComfyGridWidget<unknown, unknown>;
    children: Snippet;
  } = $props();

  const disabled = $derived(
    first.readonly ||
      second.readonly ||
      typeof first.value !== 'number' ||
      !Number.isFinite(first.value) ||
      typeof second.value !== 'number' ||
      !Number.isFinite(second.value),
  );

  function swapValues() {
    if (disabled || first.value === second.value) return;
    const firstValue = first.value;
    const secondValue = second.value;
    first.value = secondValue;
    second.value = firstValue;
    first.updateValue();
    second.updateValue();
  }
</script>

<div class="dimension-pair">
  <div class="dimension-fields">{@render children()}</div>
  <button
    type="button"
    class="dimension-swap"
    title={$t('widget.swap_dimensions')}
    aria-label={$t('widget.swap_dimensions')}
    {disabled}
    onclick={swapValues}><ArrowDownUp size={14} /></button
  >
</div>

<style>
  .dimension-pair {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .dimension-fields {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    min-width: 0;
  }

  .dimension-fields > :global(*) {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }

  .dimension-swap {
    position: absolute;
    left: 66.666667%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--bs-secondary-color);
    cursor: pointer;
    outline: none;
    opacity: 0;
    pointer-events: none;
  }

  .dimension-pair:hover .dimension-swap,
  .dimension-pair:has(:focus-visible) .dimension-swap {
    opacity: 1;
    pointer-events: auto;
  }

  .dimension-swap:hover,
  .dimension-swap:focus-visible {
    color: var(--bs-emphasis-color);
  }

  .dimension-swap:focus-visible {
    outline: 2px solid var(--bs-primary);
    outline-offset: 2px;
  }

  .dimension-swap:disabled {
    color: var(--bs-tertiary-color);
    cursor: default;
  }

  @media (hover: none), (pointer: coarse) {
    .dimension-swap {
      opacity: 1;
      pointer-events: auto;
    }
  }
</style>
