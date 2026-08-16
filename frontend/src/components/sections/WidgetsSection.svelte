<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridGroup } from '@/states/model-state.svelte';
  import NodeWidgetGroup from '../widgets/NodeWidgetGroup.svelte';
  import GridStackBoard from './GridStackBoard.svelte';

  let { container, group }: { container: HTMLElement; group?: ComfyGridGroup } = $props();

  const workspaceState = appState.workspaceState;

  let columnCount = $state(1);

  const sortedGroups = $derived.by(() => {
    if (group) {
      return [group];
    } else {
      return workspaceState.groups
        .filter((g) => !g.isTabify && g.hasVisibleNodes)
        .toSorted(ComfyGridGroup.sortGroupsByPriority);
    }
  });

  $effect(() => {
    if (!container) return;

    const updateColumnCount = () => {
      const width = container.clientWidth;
      if (width >= 1100) {
        columnCount = 3;
      } else if (width >= 700) {
        columnCount = 2;
      } else {
        columnCount = 1;
      }
    };

    updateColumnCount();

    const resizeObserver = new ResizeObserver(updateColumnCount);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  });

  const commonTabBoard = $derived(
    (appState.optionState.get('ComfyGrid.ui.common_tab_board') as boolean) ?? false,
  );
  const showBoard = $derived(!commonTabBoard || !group);
  const effectiveGroupId = $derived(commonTabBoard ? undefined : group?.id);
</script>

{#if showBoard}
  <div class="mb-1">
    <GridStackBoard boardId="Tab" groupId={effectiveGroupId}></GridStackBoard>
  </div>
{/if}
<div class="vstack gap-2">
  {#each sortedGroups as g (g.id)}
    {#snippet widgetGroup()}
      <NodeWidgetGroup group={g} {columnCount} alwaysExpanded={!g.id || group !== undefined}
      ></NodeWidgetGroup>
    {/snippet}
    {#if !group}
      <div class="accordion">
        {@render widgetGroup()}
      </div>
    {:else}
      {@render widgetGroup()}
    {/if}
  {/each}
</div>
