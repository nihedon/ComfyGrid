<script lang="ts">
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
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
  const renderedHtml = $derived(
    showMarkdown ? DOMPurify.sanitize(marked.parse(text, { async: false })) : '',
  );
</script>

<div
  class="text-preview text-break"
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
>
  {#if showMarkdown}
    <div class="markdown-preview">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html renderedHtml}
    </div>
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
  .markdown-preview :global(:last-child) {
    margin-bottom: 0;
  }
  .markdown-preview :global(img) {
    max-width: 100%;
    height: auto;
  }
  .markdown-preview :global(pre) {
    max-width: 100%;
    overflow-x: auto;
    padding: 0.5rem;
    background: var(--bs-tertiary-bg);
  }
  .markdown-preview :global(table) {
    display: block;
    max-width: 100%;
    overflow-x: auto;
  }
  .markdown-preview :global(th),
  .markdown-preview :global(td) {
    border: 1px solid var(--bs-border-color);
    padding: 0.25rem 0.5rem;
  }
</style>
