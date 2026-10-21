<script lang="ts">
  import { onMount } from 'svelte';
  import { GridStack } from 'gridstack';
  import {
    applyFloatingPositions,
    gs,
    isApplyingFloatingPositions,
    syncAndSaveLayout,
  } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridGroup, ComfyGridNode } from '@/states/model-state.svelte';
  import type { BoardId } from '@/types/board';
  import { createGridBackgroundPaths } from '@/utils/gridstack-background';
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

  const commonTabBoard = $derived(workspaceState.layout.commonTabBoard);
  const tabId = $derived(commonTabBoard ? undefined : (groupId ?? '__ungrouped__'));

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
    const effectiveNodes = workspaceState.getEffectiveNodes(boardId, tabId);
    const nodeSet = new Set(effectiveNodes.map((n) => n.id));
    return flattenNodes(groups).filter((entry) => nodeSet.has(entry.node.id));
  });

  const floatingWidgetsInBoard = $derived(workspaceState.getEffectiveWidgets(boardId, tabId));

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
  const showGridBackground = $derived(
    (appState.optionState.get('ComfyGrid.ui.show_gridstack_grid') as boolean) ?? false,
  );
  let backgroundSize = $state({
    width: 0,
    height: 0,
    columns: GRID_COLUMNS,
    cellHeight: GRID_CELL_HEIGHT,
  });
  const backgroundPaths = $derived(
    showGridBackground
      ? createGridBackgroundPaths(
          backgroundSize.width,
          backgroundSize.height,
          backgroundSize.columns,
          backgroundSize.cellHeight,
        )
      : { major: '', minor: '' },
  );

  function updateGridBackground() {
    if (!showGridBackground || !gridInstance) return;
    const bounds = container.getBoundingClientRect();
    const style = getComputedStyle(container);
    backgroundSize = {
      width: bounds.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
      height:
        bounds.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
      columns: gridInstance.getColumn(),
      cellHeight: gridInstance.getCellHeight(true),
    };
  }

  $effect(() => {
    if (!showGridBackground || !gridInstance) return;
    const observer = new ResizeObserver(updateGridBackground);
    observer.observe(container);
    updateGridBackground();
    return () => observer.disconnect();
  });

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
    updateGridBackground();

    const handleGridChange = (event: Event, items?: unknown) => {
      updateGridBackground();
      if (isApplyingFloatingPositions(grid)) return;
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

<div
  id="grid-stack-{gridKey}"
  class="border border-2 border-secondary rounded-2 grid-stack"
  bind:this={container}
>
  {#if showGridBackground && backgroundSize.width > 0 && backgroundSize.height > 0}
    <svg
      class="grid-background"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 {backgroundSize.width} {backgroundSize.height}"
      preserveAspectRatio="none"
    >
      <path class="major" d={backgroundPaths.major} />
      <path class="minor" d={backgroundPaths.minor} />
    </svg>
  {/if}
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
  .grid-stack {
    box-sizing: content-box;
  }

  .grid-background {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    fill: none;
    stroke: var(--bs-body-color);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  .major {
    stroke-opacity: 0.14;
  }

  .minor {
    stroke-opacity: 0.03;
  }

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
