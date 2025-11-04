<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridGroup, ComfyGridNode } from '@/states/model-state.svelte';
  import type { ComfyNodeMode } from '@/types/model-shared';
  import NodeWidget from './NodeWidget.svelte';
  import Self from './NodeWidgetGroup.svelte';
  import NodeMode from './comfyui/features/NodeModeSelector.svelte';

  let {
    group = $bindable(),
    columnCount,
    depth = 0,
    fixedExpanded = false,
  }: {
    group: ComfyGridGroup;
    columnCount: number;
    depth?: number;
    fixedExpanded?: boolean;
  } = $props();

  const workspaceState = appState.workspaceState;

  const noControlNodes = $derived(workspaceState.layout.noControlNodes);
  const noCollapsedNodes = $derived(workspaceState.layout.noCollapsedNodes);

  let isTitleEditing = $state(false);

  function findChildren(g: ComfyGridGroup | undefined = undefined): ComfyGridNode[] {
    if (g === undefined) {
      g = group;
    }
    return [
      ...g.nodes.map((n) => workspaceState.getRealNode(n.id)!),
      ...g.children.flatMap((c) => findChildren(c)),
    ];
  }

  const nodes = $derived(findChildren());

  const groupMode = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const modes = new Set<ComfyNodeMode>();
    for (const node of nodes.filter((node) => !node.collapsed)) {
      modes.add(node.mode);
    }
    return modes;
  }) as Set<ComfyNodeMode>;

  const floatingNodes = $derived(
    group.nodes.filter((n) => !workspaceState.layout.floatingNodes.get(n.id)),
  );

  const masonryNodes = $derived(
    floatingNodes.filter(
      (node) =>
        workspaceState.hasErrorNode(node.id) || (!node.collapsed && node.widgets.length > 0),
    ),
  );

  const listNodes = $derived(
    floatingNodes.filter(
      (node) =>
        !(workspaceState.hasErrorNode(node.id) || (!node.collapsed && node.widgets.length > 0)),
    ),
  );

  function toggleExpanded() {
    group.expanded = !group.expanded;
  }

  function handleStateChange(e: Event, mode: ComfyNodeMode) {
    const targetNodes = nodes.filter((node) => mode === 0 || !node.collapsed);
    targetNodes.forEach((node) => {
      node.mode = mode;
      node.setComfyUiProperty('mode', node.mode);
    });
    e.stopPropagation();
  }

  function handleChangeTitle() {
    group.title = group.title.trim();
    group.setComfyUiProperty('title', group.title);
  }

  const nodeColorOpts = $derived(
    appState.optionState.opts.get('node_color') ??
      appState.optionState.forms.get('node_color')?.default,
  );

  function handleChangeColor() {
    group.setComfyUiProperty('color', group.color);
  }

  function focusOnMount(e: HTMLInputElement) {
    e.focus();
  }
</script>

<div
  id="group-{group.id}"
  class="node-group position-relative"
  class:normal={groupMode.has(0)}
  class:mute={groupMode.has(2)}
  class:bypass={groupMode.has(4)}
  class:accordion-item={!fixedExpanded}
>
  {#snippet header()}
    {#if nodeColorOpts !== 'none'}
      <div
        class="pi pi-circle-fill position-relative me-2"
        style:color={group.color ? group.color + '70' : '#00000000'}
      >
        <input
          class="position-absolute top-0 end-0 w-100 h-100 opacity-0"
          type="color"
          bind:value={group.color}
          onclick={(e) => e.stopPropagation()}
          onchange={handleChangeColor}
          list="comfyUiGroupColors"
        />
        <datalist id="comfyUiGroupColors">
          <option value="#AA8888">red</option>
          <option value="#b06634">brown</option>
          <option value="#88AA88">green</option>
          <option value="#8888AA">blue</option>
          <option value="#3f789e">pale_blue</option>
          <option value="#88AAAA">cyan</option>
          <option value="#a1309b">purple</option>
          <option value="#b58b2a">yellow</option>
          <option value="#444444">black</option>
        </datalist>
      </div>
    {/if}
    <NodeMode
      className="me-2"
      mode={groupMode}
      handleChange={(e, val) => handleStateChange(e, val)}
    />
    {#if !isTitleEditing}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span ondblclick={() => (isTitleEditing = true)}>{group.title?.trim()}</span>
    {:else}
      <input
        type="text"
        class="form-control"
        bind:value={group.title}
        use:focusOnMount
        onclick={(e) => e.stopPropagation()}
        onblur={() => (isTitleEditing = false)}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            isTitleEditing = false;
            handleChangeTitle();
          }
        }}
      />
    {/if}
  {/snippet}
  {#if fixedExpanded}
    <div
      class="d-flex align-items-center p-2"
      aria-controls="group-{group.id}-contents"
      style:padding-left="{0.75 + depth * 1}rem"
    >
      {@render header()}
    </div>
  {:else}
    <h2 class="accordion-header">
      <button
        type="button"
        class="accordion-button p-2"
        class:collapsed={fixedExpanded ? false : !group.expanded}
        aria-expanded={fixedExpanded ? true : group.expanded}
        aria-controls="group-{group.id}-contents"
        onclick={toggleExpanded}
        style:padding-left="{0.75 + depth * 1}rem"
      >
        {@render header()}
      </button>
    </h2>
  {/if}
  {#snippet contents()}
    {#if masonryNodes.length > 0}
      <div class="masonry-grid" style:column-count={columnCount}>
        {#each masonryNodes as node, index (`${node.id}-${index}`)}
          <div class="masonry-item">
            <NodeWidget {node} />
          </div>
        {/each}
      </div>
    {/if}
    {#if listNodes.length > 0}
      <div class="list-group" style:display={noControlNodes && noCollapsedNodes ? 'none' : ''}>
        {#each listNodes as node, index (`${node.id}-${index}`)}
          <NodeWidget {node} />
        {/each}
      </div>
    {/if}
    {#each group.sortedChildren as child (child.id ?? `child-${child.id}`)}
      {#if !group.hasVisibleNodes || child.hasVisibleNodes}
        {@const childIndex = group.children.indexOf(child)}
        <div class="accordion">
          <Self bind:group={group.children[childIndex]} {columnCount} depth={depth + 1} />
        </div>
      {/if}
    {/each}
  {/snippet}
  {#if fixedExpanded}
    <div class="vstack gap-2" style="padding-left: 2rem !important">
      {@render contents()}
    </div>
  {:else}
    <div
      id="group-{group.id}-contents"
      class="accordion-collapse"
      class:collapse={fixedExpanded ? false : !group.expanded}
    >
      <div class="accordion-body vstack p-2 gap-2" style="padding-left: 2rem !important">
        {@render contents()}
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  .node-group {
    padding: 0 4px 4px 0;
  }

  .accordion-button {
    box-shadow: initial !important;
    &:not(.collapsed) {
      background-color: inherit !important;
    }
  }

  .masonry-grid {
    column-gap: 0.5rem;
  }

  .masonry-item {
    break-inside: avoid;
    margin-bottom: 0.5rem;
  }
</style>
