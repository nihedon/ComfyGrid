<script lang="ts">
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
        class="btn btn-sm btn-outline-secondary"
        onclick={() => expandAll(value)}
      >
        <i class="pi pi-angle-down me-1"></i>Expand All
      </button>
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick={collapseAll}>
        <i class="pi pi-angle-right me-1"></i>Collapse All
      </button>
    </div>
    <button type="button" class="btn btn-sm btn-outline-secondary" onclick={copyJson}>
      <i class="pi {copySuccess ? 'pi-check text-success' : 'pi-copy'} me-1"></i>
      {copySuccess ? 'Copied!' : 'Copy JSON'}
    </button>
  </div>

  <div class="json-viewer-content flex-grow-1 p-3 overflow-auto font-monospace small">
    {#snippet node(val: unknown, keyName?: string, path = 'root', isLast = true)}
      <div class="json-node-line">
        {#if isObject(val)}
          {@const keys = Object.keys(val)}
          {@const isArr = Array.isArray(val)}
          {@const isExpanded = expandedPaths.has(path)}
          {@const openChar = isArr ? '[' : '{'}
          {@const closeChar = isArr ? ']' : '}'}

          <span
            class="json-toggle me-1"
            role="button"
            tabindex="0"
            onclick={() => togglePath(path)}
            onkeydown={(e) => e.key === 'Enter' && togglePath(path)}
          >
            <i class="pi {isExpanded ? 'pi-chevron-down' : 'pi-chevron-right'}"></i>
          </span>

          {#if keyName !== undefined}
            <span class="json-key">{JSON.stringify(keyName)}</span><span class="json-separator"
              >:
            </span>
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
          {:else}
            <div class="json-children ps-3 border-start ms-2">
              {#each keys as k, i (k)}
                {@render node(
                  (val as Record<string, unknown>)[k],
                  isArr ? undefined : k,
                  `${path}.${k}`,
                  i === keys.length - 1,
                )}
              {/each}
            </div>
            <div class="json-node-close">
              <span class="json-bracket">{closeChar}</span>{#if !isLast}<span class="json-separator"
                  >,</span
                >{/if}
            </div>
          {/if}
        {:else}
          <span class="json-indent"></span>
          {#if keyName !== undefined}
            <span class="json-key">{JSON.stringify(keyName)}</span><span class="json-separator"
              >:
            </span>
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
        {/if}
      </div>
    {/snippet}

    {@render node(value, undefined, 'root', true)}
  </div>
</div>

<style lang="scss">
  .json-viewer-container {
    background-color: var(--bs-body-bg);
  }

  .json-toggle {
    cursor: pointer;
    user-select: none;
    font-size: 0.75rem;
    color: var(--bs-secondary);
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
