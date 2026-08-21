<script lang="ts">
  import { tick } from 'svelte';
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget } = $props();

  let isEditing = $state(false);
  let editValue = $state('');
  let textareaRef = $state<HTMLTextAreaElement | null>(null);

  const renderedHtml = $derived.by(() => {
    const rawValue = String(widget.value ?? '');
    if (!rawValue) return '';
    try {
      const parsed = marked.parse(rawValue, { async: false }) as string;
      return DOMPurify.sanitize(parsed);
    } catch {
      return DOMPurify.sanitize(rawValue);
    }
  });

  function adjustTextareaHeight() {
    if (!textareaRef) return;
    textareaRef.style.height = 'auto';
    textareaRef.style.height = `${textareaRef.scrollHeight}px`;
  }

  async function startEditing() {
    editValue = String(widget.value ?? '');
    isEditing = true;
    await tick();
    if (textareaRef) {
      adjustTextareaHeight();
      textareaRef.focus();
      textareaRef.setSelectionRange(0, 0);
      textareaRef.scrollTo(0, 0);
      textareaRef.closest('.widget-stack')?.scrollTo(0, 0);
    }
  }

  function finishEditing() {
    if (!isEditing) return;
    if (widget.value !== editValue) {
      widget.value = editValue;
      widget.updateValue();
    }
    isEditing = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      editValue = String(widget.value ?? '');
      isEditing = false;
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      finishEditing();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="markdown-content text-break"
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
  ondblclick={startEditing}
>
  {#if isEditing}
    <textarea
      bind:this={textareaRef}
      class="form-control form-control-sm my-1"
      bind:value={editValue}
      oninput={adjustTextareaHeight}
      onblur={finishEditing}
      onkeydown={handleKeyDown}
      style="overflow: hidden; resize: vertical;"
      rows={Math.max(3, editValue.split('\n').length)}></textarea>
  {:else}
    <div>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html renderedHtml}
    </div>
  {/if}
</div>

<style>
  .markdown-content {
    display: initial !important;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }
  .markdown-content :global(img) {
    max-width: 100%;
    height: auto;
  }
  .markdown-content :global(pre) {
    background-color: var(--bs-tertiary-bg);
    padding: 0.5rem;
    border-radius: 0.25rem;
    overflow-x: auto;
  }
  .markdown-content :global(code) {
    font-family: var(--bs-font-monospace);
  }
  .markdown-content :global(table) {
    border: 1px solid var(--bs-border-color);
    border-collapse: collapse;
  }
  .markdown-content :global(th) {
    border: 1px solid var(--bs-border-color);
    padding: 0 0.5rem;
  }
  .markdown-content :global(td) {
    border: 1px solid var(--bs-border-color);
    padding: 0 0.5rem;
  }
</style>
