<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridGroup } from '@/states/model-state.svelte';
  import NodeWidgetGroup from '../widgets/NodeWidgetGroup.svelte';
  import GridStackBoard from './GridStackBoard.svelte';

  let { container, groupId }: { container: HTMLElement; groupId?: string } = $props();

  const workspaceState = appState.workspaceState;

  let columnCount = $state(1);

  const filteredGroups = $derived.by(() => {
    if (groupId) {
      return [workspaceState.groups.find((g) => g.id === groupId)!];
    } else {
      return workspaceState.groups.filter((g) => !g.isTabify);
    }
  });

  const sortedGroups = $derived.by(() => {
    return filteredGroups
      .filter((g) => g.hasVisibleNodes)
      .toSorted(ComfyGridGroup.sortGroupsByPriority);
  });

  $effect(() => {
    if (!container) return;

    const updateColumnCount = () => {
      const width = container.clientWidth;
      if (width >= 1400) {
        columnCount = 3;
      } else if (width >= 900) {
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
</script>

<div class="mb-1">
  <GridStackBoard boardId="Tab" {groupId}></GridStackBoard>
</div>
<div class="vstack gap-2">
  {#each sortedGroups as group (group.id)}
    {@const groupIndex = workspaceState.groups.indexOf(group)}
    {#snippet widgetGroup()}
      <NodeWidgetGroup
        bind:group={workspaceState.groups[groupIndex]}
        {columnCount}
        fixedExpanded={!group.id || groupId !== undefined}
      ></NodeWidgetGroup>
    {/snippet}
    {#if groupId === undefined}
      <div class="accordion">
        {@render widgetGroup()}
      </div>
    {:else}
      {@render widgetGroup()}
    {/if}
  {/each}
</div>
