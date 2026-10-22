<script lang="ts">
  import MarkdownContent from '@/components/common/MarkdownContent.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget } = $props();

  const showMarkdown = $derived.by(() => {
    const mode = widget.node.widgets.find((item) => item.name === 'preview_mode');
    return (
      (mode
        ? mode.value
        : widget.node.comfyNode.widgets.find((item) => item.name === 'preview_mode')?.value) ===
      true
    );
  });
  const text = $derived(String(widget.value ?? ''));
</script>

<div
  class="text-preview text-break"
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
>
  {#if showMarkdown}
    <MarkdownContent value={text} />
  {:else}
    <div class="plain-preview">{text}</div>
  {/if}
</div>

<style>
  .text-preview {
    display: block !important;
    min-width: 0;
    padding: 0.5rem;
    overflow-wrap: anywhere;
  }
  .plain-preview {
    white-space: pre-wrap;
  }
</style>
