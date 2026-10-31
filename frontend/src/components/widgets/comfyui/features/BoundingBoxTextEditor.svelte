<script lang="ts">
  import { Tag } from '@lucide/svelte';
  import CodeEditor from '@/components/common/CodeEditor.svelte';
  import { t } from '@/i18n/i18n';

  let {
    value = $bindable(''),
    label,
    readonly = false,
    documentKey,
    onblur,
  }: {
    value?: string;
    label: string;
    readonly?: boolean;
    documentKey: number;
    onblur?: (event: FocusEvent) => void;
  } = $props();
  let mode = $state<'prompt' | 'json'>('prompt');
  let tags = $state(true);
  let editor = $state<{ focus: () => void }>();
  export function focus() {
    editor?.focus();
  }
</script>

<div class="bbox-text-editor rounded" role="group" aria-label={label}>
  <div
    class="editor-toolbar d-flex align-items-center gap-1 border rounded-top border-bottom-0 bg-light p-1"
  >
    <span class="text-truncate me-auto" title={label}>{label}</span>
    <select
      class="form-select form-select-sm w-auto border-0 bg-transparent py-0"
      aria-label={`${label} editor`}
      disabled={readonly}
      value={mode}
      onchange={(event) => {
        mode = event.currentTarget.value as typeof mode;
        tags = mode === 'prompt';
      }}
    >
      {#each ['prompt', 'json'] as item (item)}<option value={item}
          >{$t(`widget.select.${item}.title`, {}, item === 'prompt' ? 'Prompt' : 'JSON')}</option
        >{/each}
    </select>
    <button
      type="button"
      class="btn btn-xs btn-icon"
      class:btn-primary={tags}
      class:btn-secondary={!tags}
      aria-pressed={tags}
      title={$t('widget.tags.toggle')}
      aria-label={$t('widget.tags.toggle')}
      disabled={readonly}
      onclick={() => {
        tags = !tags;
      }}><Tag size={12} /></button
    >
  </div>
  <div class="editor-body">
    {#key documentKey}
      <CodeEditor
        bind:this={editor}
        bind:value
        {mode}
        enableTags={tags}
        {readonly}
        ariaLabel={label}
        placeholder={label}
        rows={4}
        {onblur}
      />
    {/key}
  </div>
</div>

<style>
  .bbox-text-editor {
    min-width: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .editor-toolbar {
    flex-shrink: 0;
    min-width: 0;
  }
  :global([data-bs-theme='dark']) .editor-toolbar {
    background-color: var(--bs-tertiary-bg) !important;
  }
  .editor-toolbar span {
    min-width: 0;
  }
  .editor-body {
    display: flex;
    min-width: 0;
    height: 96px;
    min-height: 96px;
    max-height: 96px;
    overflow: auto;
  }
  .editor-body :global(.cm-content) {
    min-height: 96px !important;
  }
  .editor-body :global(.json-editor) {
    border-top-left-radius: 0 !important;
    border-top-right-radius: 0 !important;
  }
</style>
