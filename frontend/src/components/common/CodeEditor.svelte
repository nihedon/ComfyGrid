<script lang="ts">
  import JsonEditor from './JsonEditor.svelte';
  import PromptEditor from './PromptEditor.svelte';

  let {
    value = $bindable(''),
    mode = 'text',
    enableTags = false,
    readonly = false,
    placeholder = '',
    ariaLabel = '',
    rows = 6,
    oninput,
    onblur,
  }: {
    value?: string;
    mode?: 'text' | 'prompt' | 'json';
    enableTags?: boolean;
    readonly?: boolean;
    placeholder?: string;
    ariaLabel?: string;
    rows?: number;
    oninput?: (event: Event) => void;
    onblur?: (event: FocusEvent) => void;
  } = $props();

  let host: HTMLDivElement;
  export function focus() {
    host?.querySelector<HTMLElement>('.cm-content')?.focus();
  }
</script>

<div bind:this={host} class="code-editor">
  {#if mode === 'json'}
    <JsonEditor
      bind:value
      {readonly}
      {placeholder}
      {ariaLabel}
      enablePromptPilot={enableTags}
      {oninput}
      {onblur}
    />
  {:else}
    <PromptEditor
      bind:value
      {readonly}
      {placeholder}
      {ariaLabel}
      {rows}
      enablePromptPilot={enableTags}
      highlightMode={enableTags ? 'prompt' : 'segments'}
      {oninput}
      {onblur}
    />
  {/if}
</div>

<style>
  .code-editor {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    align-items: stretch !important;
    text-align: left;
  }
</style>
