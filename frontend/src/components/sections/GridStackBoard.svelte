<script lang="ts">
  import { onMount } from 'svelte';
  import { GridStack } from 'gridstack';
  import {
    applyFloatingPositions,
    gs,
    syncAndSaveLayout,
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

  const commonTabBoard = $derived(
    (appState.optionState.get('ComfyGrid.ui.common_tab_board') as boolean) ?? false,
  );

  const groups = $derived.by(() => {
    let filteredGroups: ReadonlyArray<ComfyGridGroup>;
    if (boardId === 'Global' || (boardId === 'Tab' && commonTabBoard)) {
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
      if (isTopLevel) {
        if (boardId !== 'Global' && !(boardId === 'Tab' && commonTabBoard)) {
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

  const nodesInBoard = $derived.by(() => {
    const effectiveNodes = workspaceState.getEffectiveNodes(boardId, groupId);
    const nodeSet = new Set(effectiveNodes.map((n) => n.id));
    return flattenNodes(groups).filter((entry) => nodeSet.has(entry.node.id));
  });

  const floatingWidgetsInBoard = $derived.by(() => {
    const result: Array<{
      group: ComfyGridGroup;
      node: ComfyGridNode;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      widget: any;
    }> = [];
    const allEntries = flattenNodes(workspaceState.groups);

    for (const entry of allEntries) {
      for (const widget of entry.node.widgets) {
        if (widget.type === 'customtext') {
          const targetBoard = workspaceState.layout?.floatingWidgets?.get(widget.id);
          if (!targetBoard) continue;

          if (boardId === 'Global' && targetBoard === 'Global') {
            result.push({ group: entry.group, node: entry.node, widget });
          } else if (boardId === 'Tab' && targetBoard === 'Tab') {
            if (commonTabBoard || groupId === undefined || entry.group.id === groupId) {
              result.push({ group: entry.group, node: entry.node, widget });
            }
          }
        }
      }
    }
    return result;
  });

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

  let gridInstance = $state<GridStack | null>(null);

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
    gridInstance = grid;
    workspaceState.setGridStackBoard(gridKey, grid);
    applyFloatingPositions(gridKey);

    const handleGridChange = (event: Event, items?: unknown) => {
      logger.trace(`[LAYOUT_LOG] GridStack event: type="${event.type}", board="${gridKey}"`, items);

      const logicalKey = gridKey.split('-')[0];
      const savedNodes = (grid.save(false) ?? []) as Array<{
        id?: string;
        x?: number;
        y?: number;
        w?: number;
        h?: number;
      }>;
      for (const nodeItem of savedNodes) {
        if (nodeItem.id && nodeItem.x !== undefined && nodeItem.y !== undefined) {
          workspaceState.layout.updateFloatingPosition(logicalKey, nodeItem.id, {
            x: nodeItem.x,
            y: nodeItem.y,
            w: nodeItem.w ?? 1,
            h: nodeItem.h ?? 1,
          });
        }
      }

      saveLayoutDebounced();
    };

    grid.on('change', (e, items) => handleGridChange(e, items));
    grid.on('resizestop', (e, el) => {
      logger.trace(
        `[LAYOUT_LOG] GridStack resizestop: board="${gridKey}", gs-id="${el?.getAttribute('gs-id')}"`,
      );
      handleGridChange(e, el);
    });
    grid.on('dragstop', (e, el) => {
      logger.trace(
        `[LAYOUT_LOG] GridStack dragstop: board="${gridKey}", gs-id="${el?.getAttribute('gs-id')}"`,
      );
      handleGridChange(e, el);
    });

    return () => {
      grid.off('change');
      grid.off('resizestop');
      grid.off('dragstop');
      try {
        grid.destroy(false);
      } catch (err) {
        logger.error('Error destroying GridStack instance:', err);
      }
      gridInstance = null;
      workspaceState.deleteGridStackBoard(gridKey);
    };
  });

  $effect(() => {
    if (gridInstance) {
      workspaceState.setGridStackBoard(gridKey, gridInstance);
    }
  });

  let prevNodeIdsKey = '';
  $effect(() => {
    const currentNodeIdsKey = [
      ...nodesInBoard.map((n) => n.node.id),
      ...floatingWidgetsInBoard.map((w) => w.widget.id),
    ].join(',');
    if (currentNodeIdsKey !== prevNodeIdsKey) {
      prevNodeIdsKey = currentNodeIdsKey;
      if (gridInstance) {
        workspaceState.setGridStackBoard(gridKey, gridInstance);
      }
      logger.log(`Nodes layout in board "${gridKey}" changed`);
      applyFloatingPositions(gridKey);
    }
  });
</script>

<div id="grid-stack-{gridKey}" class="grid-stack w-100" bind:this={container}>
  {#each nodesInBoard as { group, node } (`node-${group.id}-${node.id}`)}
    {#if workspaceState.layout.floatingNodes.get(node.id) === boardId}
      <div class="grid-stack-item" use:gs={getGSParams(node.id, node)} data-id={node.id}>
        <NodeWidget {node} />
      </div>
    {/if}
  {/each}
  {#each floatingWidgetsInBoard as { node, widget } (`widget-${widget.id}`)}
    <div class="grid-stack-item" use:gs={getGSParams(widget.id, node)} data-id={widget.id}>
      <NodeWidget {node} {widget} />
    </div>
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
