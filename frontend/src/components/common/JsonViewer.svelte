<script lang="ts">
  import {
    Check,
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
    Copy,
  } from '@lucide/svelte';
  import { SvelteSet } from 'svelte/reactivity';

  let { value }: { value: unknown } = $props();

  let expandedPaths = new SvelteSet<string>(['root']);
  let copySuccess = $state(false);

  function isObject(val: unknown): val is Record<string, unknown> {
    return typeof val === 'object' && val !== null;
  }

  function togglePath(path: string) {
    if (expandedPaths.has(path)) {
      expandedPaths.delete(path);
    } else {
      expandedPaths.add(path);
    }
  }

  function expandAll(obj: unknown) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const paths = new Set<string>();
    function collect(val: unknown, path = 'root') {
      if (!isObject(val)) return;
      paths.add(path);
      if (Array.isArray(val)) {
        val.forEach((item, index) => collect(item, `${path}.${index}`));
      } else {
        Object.entries(val).forEach(([key, item]) => collect(item, `${path}.${key}`));
      }
    }
    collect(obj);
    expandedPaths.clear();
    for (const p of paths) {
      expandedPaths.add(p);
    }
  }

  function collapseAll() {
    expandedPaths.clear();
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      copySuccess = true;
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    } catch (e) {
      console.error('Failed to copy JSON:', e);
    }
  }
</script>

<div class="json-viewer-container d-flex flex-column h-100 border rounded overflow-hidden">
  <div
    class="json-viewer-toolbar d-flex align-items-center justify-content-between p-2 border-bottom bg-body-tertiary"
  >
    <div class="d-flex gap-1">
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
        onclick={() => expandAll(value)}
      >
        <ChevronsUpDown size={16} />Expand
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
        onclick={collapseAll}
      >
        <ChevronsDownUp size={16} />Collapse
      </button>
    </div>
    <button
      type="button"
      class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
      onclick={copyJson}
    >
      {#if copySuccess}
        <Check size={16} class="text-success" />
      {:else}
        <Copy size={16} />
      {/if}
      {copySuccess ? 'Copied!' : 'Copy JSON'}
    </button>
  </div>

  <div class="json-viewer-content flex-grow-1 p-3 overflow-auto font-monospace small">
    {#snippet node(
      val: unknown,
      keyName: string | undefined = undefined,
      path = 'root',
      isLast = true,
    )}
      {#if isObject(val)}
        {@const keys = Object.keys(val)}
        {@const isArr = Array.isArray(val)}
        {@const isExpanded = expandedPaths.has(path)}
        {@const openChar = isArr ? '[' : '{'}
        {@const closeChar = isArr ? ']' : '}'}

        <div class="json-node">
          <div class="json-node-line d-flex align-items-center">
            <span
              class="json-toggle"
              role="button"
              tabindex="0"
              onclick={() => togglePath(path)}
              onkeydown={(e) => e.key === 'Enter' && togglePath(path)}
            >
              {#if isExpanded}
                <ChevronDown size={14} />
              {:else}
                <ChevronRight size={14} />
              {/if}
            </span>

            {#if keyName !== undefined}
              <span class="json-key">{JSON.stringify(keyName)}</span><span class="json-separator"
                >:&nbsp;</span
              >
            {/if}

            <span class="json-bracket">{openChar}</span>

            {#if !isExpanded}
              <span
                class="json-preview text-muted ms-1"
                role="button"
                tabindex="0"
                onclick={() => togglePath(path)}
                onkeydown={(e) => e.key === 'Enter' && togglePath(path)}
              >
                {isArr ? `${keys.length} items` : `${keys.length} keys`}
              </span>
              <span class="json-bracket">{closeChar}</span>{#if !isLast}<span class="json-separator"
                  >,</span
                >{/if}
            {/if}
          </div>

          {#if isExpanded}
            <div class="json-children">
              {#each keys as k, i (k)}
                {@render node(
                  (val as Record<string, unknown>)[k],
                  isArr ? undefined : k,
                  `${path}.${k}`,
                  i === keys.length - 1,
                )}
              {/each}
            </div>
            <div class="json-node-line d-flex align-items-center">
              <span class="json-toggle-spacer"></span>
              <span class="json-bracket">{closeChar}</span>{#if !isLast}<span class="json-separator"
                  >,</span
                >{/if}
            </div>
          {/if}
        </div>
      {:else}
        <div class="json-node-line d-flex align-items-center">
          <span class="json-toggle-spacer"></span>

          {#if keyName !== undefined}
            <span class="json-key">{JSON.stringify(keyName)}</span><span class="json-separator"
              >:&nbsp;</span
            >
          {/if}

          {#if typeof val === 'string'}
            <span class="json-value-string">{JSON.stringify(val)}</span>
          {:else if typeof val === 'number'}
            <span class="json-value-number">{val}</span>
          {:else if typeof val === 'boolean'}
            <span class="json-value-boolean">{val}</span>
          {:else if val === null || val === undefined}
            <span class="json-value-null">null</span>
          {:else}
            <span class="json-value-other">{String(val)}</span>
          {/if}

          {#if !isLast}<span class="json-separator">,</span>{/if}
        </div>
      {/if}
    {/snippet}

    {@render node(value, undefined, 'root', true)}
  </div>
</div>

<style lang="scss">
  .json-viewer-container {
    background-color: var(--bs-body-bg);
  }

  .json-node-line {
    min-height: 1.5rem;
    line-height: 1.5rem;
  }

  .json-toggle,
  .json-toggle-spacer {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
    margin-right: 0.25rem;
  }

  .json-toggle {
    cursor: pointer;
    user-select: none;
    color: rgba(var(--bs-body-color-rgb), 0.3);
    border-radius: 3px;

    &:hover {
      background-color: rgba(var(--bs-secondary-rgb), 0.8);
      color: var(--bs-body-color);
    }
  }

  .json-children {
    padding-left: 1.25rem;
    margin-left: 0.6rem;
    border-left: 1px dashed var(--bs-border-color);
  }

  .json-key {
    color: var(--bs-primary);
    font-weight: 600;
  }

  .json-separator {
    color: var(--bs-body-color);
  }

  .json-bracket {
    color: var(--bs-body-color);
    font-weight: bold;
  }

  .json-value-string {
    color: #2b9348;
    word-break: break-all;
  }

  .json-value-number {
    color: #d90429;
  }

  .json-value-boolean {
    color: #0077b6;
    font-weight: bold;
  }

  .json-value-null {
    color: #6c757d;
    font-style: italic;
  }

  .json-preview {
    cursor: pointer;
    font-size: 0.85em;
  }
</style>
