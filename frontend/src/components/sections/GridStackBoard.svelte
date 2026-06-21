<script lang="ts">
  import { onMount } from 'svelte';
  import { GridStack } from 'gridstack';
  import {
    gs,
    syncAndSaveLayout,
    updateAttribute,
    updateBoardFloatingState,
  } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridGroup, ComfyGridNode } from '@/states/model-state.svelte';
  import type { BoardId } from '@/types/board';
  import logger from '@/utils/logger';
  import { debounceOnTick } from '@/utils/schedule';
  import NodeWidget from '../widgets/NodeWidget.svelte';

  let { boardId, groupId }: { boardId: BoardId; groupId?: string } = $props();

  const workspaceState = appState.workspaceState;

  const gridKey = $derived(groupId ? `${boardId}-${groupId}` : boardId);

  const GRID_COLUMNS = 12; // columns
  const GRID_CELL_HEIGHT = 12; // row height (px)
  const GRID_MARGIN = 4; // margin (px)

  let container: HTMLDivElement;

  const saveLayoutDebounced = debounceOnTick(() => {
    logger.log(`Saving layout for board "${gridKey}" (debounced by tick)...`);
    if (workspaceState.layout?.graphId) {
      syncAndSaveLayout();
    }
  });

  type FlatNodeEntry = { group: ComfyGridGroup; node: ComfyGridNode };

  const groups = $derived.by(() => {
    let filteredGroups: ReadonlyArray<ComfyGridGroup>;
    if (boardId === 'Global') {
      filteredGroups = workspaceState.groups;
    } else {
      const groups = workspaceState.groups.filter((g) => {
        return g.id === groupId || !g.isTabify;
      });
      filteredGroups = groups;
    }
    return filteredGroups;
  });

  function flattenNodes(
    groups: ReadonlyArray<ComfyGridGroup>,
    isTopLevel: boolean = true,
  ): FlatNodeEntry[] {
    const result: FlatNodeEntry[] = [];
    for (const group of groups) {
      //if (!group) continue;
      if (isTopLevel) {
        if (boardId !== 'Global') {
          if (groupId !== undefined) {
            // Specific Tab board: only include the designated group
            if (group.id !== groupId) {
              continue;
            }
          } else if (group.isTabify) {
            continue;
          }
        }
      }
      for (const node of group.nodes) {
        result.push({ group, node });
      }
      result.push(...flattenNodes(group.children, false));
    }
    return result;
  }

  const nodesInBoard = $derived(flattenNodes(groups));

  function getGSParams(id: string, node: ComfyGridNode) {
    const saved = workspaceState.layout?.floatingPositions?.get(boardId)?.[String(id)];
    return {
      id,
      w: saved?.w ?? 4,
      h: saved?.h ?? (node.collapsed ? 4 : 14),
      x: saved?.x,
      y: saved?.y,
    };
  }

  onMount(() => {
    logger.log(`gridstack init: board "${gridKey}"`);
    const grid = GridStack.init(
      {
        float: false,
        column: GRID_COLUMNS,
        cellHeight: GRID_CELL_HEIGHT,
        margin: GRID_MARGIN,
        draggable: {
          handle: '.card-header',
        },
        resizable: {
          handles: 'se, sw, e, s, w',
        },
      },
      container,
    );
    workspaceState.setGridStackBoard(gridKey, grid);

    const handleGridChange = () => {
      updateAttribute(grid);
      saveLayoutDebounced();
    };

    grid.on('change', handleGridChange);
    grid.on('resizestop', handleGridChange);
    grid.on('dragstop', handleGridChange);

    return () => {
      grid.off('change');
      grid.off('resizestop');
      grid.off('dragstop');
      workspaceState.deleteGridStackBoard(gridKey);
    };
  });

  $effect(() => {
    if (nodesInBoard.length > 0) {
      logger.log(`Nodes in board "${gridKey}" changed, syncing GridStack...`);
      updateBoardFloatingState();
    }
  });
</script>

<div id="grid-stack-{gridKey}" class="grid-stack w-100" bind:this={container}>
  {#each nodesInBoard as { group, node } (`${group.id}-${node.id}`)}
    {#if workspaceState.layout.floatingNodes.get(node.id) === boardId}
      <div class="grid-stack-item" use:gs={getGSParams(node.id, node)} data-id={node.id}>
        <NodeWidget {node} />
      </div>
    {/if}
    {#each node.widgets as widget, widgetIndex (`${widget.id}-${widgetIndex}`)}
      {#if widget.type === 'customtext' && workspaceState.layout.floatingWidgets.get(widget.id) === boardId}
        <div class="grid-stack-item" use:gs={getGSParams(widget.id, node)} data-id={widget.id}>
          <NodeWidget {node} {widget} />
        </div>
      {/if}
    {/each}
  {/each}
</div>

<style lang="scss">
  :global(.grid-stack-item > .ui-resizable-handle) {
    opacity: 0 !important;
  }

  :global(.ui-resizable-n, .ui-resizable-s) {
    height: 5px !important;
  }
  :global(.ui-resizable-e, .ui-resizable-w) {
    width: 5px !important;
  }
  :global(.ui-resizable-se, .ui-resizable-sw) {
    height: 8px !important;
    width: 8px !important;
  }
</style>
