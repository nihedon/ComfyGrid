<script lang="ts">
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';

  let { value }: { value: string } = $props();

  const renderedHtml = $derived.by(() => {
    if (!value) return '';
    try {
      return DOMPurify.sanitize(marked.parse(value, { async: false }));
    } catch {
      return DOMPurify.sanitize(value);
    }
  });
</script>

<div class="markdown-rendered text-break">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html renderedHtml}
</div>

<style>
  .markdown-rendered {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .markdown-rendered :global(p:last-child) {
    margin-bottom: 0;
  }
  .markdown-rendered :global(img) {
    max-width: 100%;
    height: auto;
  }
  .markdown-rendered :global(pre) {
    max-width: 100%;
    background-color: var(--bs-tertiary-bg);
    padding: 0.5rem;
    border-radius: 0.25rem;
    overflow-x: auto;
  }
  .markdown-rendered :global(code) {
    font-family: var(--bs-font-monospace);
  }
  .markdown-rendered :global(table) {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
  }
  .markdown-rendered :global(th),
  .markdown-rendered :global(td) {
    border: 1px solid var(--bs-border-color);
    padding: 0.25rem 0.5rem;
  }
</style>
