<script lang="ts">
  import { CircleDot } from '@lucide/svelte';
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridGroup, ComfyGridNode } from '@/states/model-state.svelte';
  import type { ComfyNodeMode } from '@/types/model-shared';
  import NodeWidget from './NodeWidget.svelte';
  import Self from './NodeWidgetGroup.svelte';
  import NodeModeSelector from './comfyui/features/NodeModeSelector.svelte';

  let {
    group,
    columnCount,
    depth = 0,
    alwaysExpanded = false,
  }: {
    group: ComfyGridGroup;
    columnCount: number;
    depth?: number;
    alwaysExpanded?: boolean;
  } = $props();

  const workspaceState = appState.workspaceState;

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

  const visibleNodes = $derived(
    group.nodes.filter((n) => n.isGroupVisible),
  );

  const masonryNodes = $derived(
    visibleNodes.filter(
      (node) =>
        workspaceState.hasErrorNode(node.id) || (!node.collapsed && node.widgets.length > 0),
    ),
  );

  const listNodes = $derived(
    visibleNodes.filter(
      (node) =>
        !(workspaceState.hasErrorNode(node.id) || (!node.collapsed && node.widgets.length > 0)),
    ),
  );

  function toggleExpanded() {
    group.expanded = !group.expanded;
  }

  function handleStateChange(e: Event, mode: ComfyNodeMode) {
    nodes.forEach((node) => {
      node.mode = mode;
    });
    e.stopPropagation();
  }

  const nodeColorOpts = $derived(appState.optionState.get('ComfyGrid.ui.node_color'));

  function focusOnMount(e: HTMLInputElement) {
    e.focus();
  }
</script>

<div
  id="group-{group.id}"
  class="node-group position-relative"
  class:normal={group.modeSet.has(0)}
  class:mute={group.modeSet.has(2)}
  class:bypass={group.modeSet.has(4)}
  class:accordion-item={!alwaysExpanded}
>
  {#snippet header()}
    {#if nodeColorOpts !== 'none'}
      <div
        class="position-relative me-2 d-inline-flex align-items-center"
        style:color={group.color ? group.color + '70' : 'transparent'}
      >
        <CircleDot size={16} />
        <input
          class="position-absolute top-0 end-0 w-100 h-100 opacity-0"
          type="color"
          bind:value={group.color}
          onclick={(e) => e.stopPropagation()}
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
    <NodeModeSelector
      className="me-2"
      mode={group.modeSet}
      handleChange={(e, val) => handleStateChange(e, val)}
    />
    {#if !isTitleEditing}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        ondblclick={() => {
          if (group.id !== undefined) {
            isTitleEditing = true;
          }
        }}>{group.title?.trim()}</span
      >
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
          }
        }}
      />
    {/if}
  {/snippet}
  {#if alwaysExpanded}
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
        class:collapsed={alwaysExpanded ? false : !group.expanded}
        aria-expanded={alwaysExpanded ? true : group.expanded}
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
      <div class="list-group">
        {#each listNodes as node, index (`${node.id}-${index}`)}
          <NodeWidget {node} />
        {/each}
      </div>
    {/if}
    {#each group.sortedChildren as child (child.id ?? `child-${child.id}`)}
      {#if !group.hasVisibleNodes || child.hasVisibleNodes}
        <div class="accordion">
          <Self group={child} {columnCount} depth={depth + 1} />
        </div>
      {/if}
    {/each}
  {/snippet}
  {#if alwaysExpanded}
    <div class="vstack gap-2" style="padding-left: 2rem !important">
      {@render contents()}
    </div>
  {:else}
    <div
      id="group-{group.id}-contents"
      class="accordion-collapse"
      class:collapse={alwaysExpanded ? false : !group.expanded}
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
