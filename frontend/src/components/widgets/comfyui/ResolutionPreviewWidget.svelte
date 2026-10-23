<script lang="ts">
  import type { ComfyGridWidget } from '@/states/model-state.svelte';
  import { calculateResolutionPreview } from './features/resolution-preview';

  let {
    widget,
  }: {
    widget: ComfyGridWidget<
      null,
      { ratio_widget?: string; megapixels_widget?: string; multiple_widget?: string }
    >;
  } = $props();

  function siblingValue(name: string): unknown {
    const sibling = widget.node.widgets.find((item) => item.name === name);
    return sibling
      ? sibling.value
      : widget.node.comfyNode.widgets.find((item) => item.name === name)?.value;
  }

  const resolution = $derived(
    calculateResolutionPreview(
      siblingValue(widget.options?.ratio_widget ?? 'aspect_ratio'),
      siblingValue(widget.options?.megapixels_widget ?? 'megapixels'),
      siblingValue(widget.options?.multiple_widget ?? 'multiple'),
    ),
  );
</script>

<div
  class="resolution-preview form-control bg-body-tertiary gap-2 flex-wrap"
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
>
  {#if resolution}
    <span class="text-nowrap">{resolution.width} &times; {resolution.height}</span>
    <span class="text-body-secondary text-nowrap">{resolution.megapixels.toFixed(2)} MP</span>
  {:else}
    <span class="text-body-secondary">&mdash;</span>
  {/if}
</div>
