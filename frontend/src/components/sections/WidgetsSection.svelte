<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridGroup } from '@/states/model-state.svelte';
  import NodeWidgetGroup from '../widgets/NodeWidgetGroup.svelte';
  import GridStackBoard from './GridStackBoard.svelte';

  let { group }: { group?: ComfyGridGroup } = $props();

  const workspaceState = appState.workspaceState;

  let containerWidth = $state(0);

  const columnCount = $derived(containerWidth >= 1100 ? 3 : containerWidth >= 700 ? 2 : 1);

  const sortedGroups = $derived.by(() => {
    if (group) {
      return [group];
    } else {
      return workspaceState.groups
        .filter((g) => !g.isTabify && g.hasVisibleNodes)
        .toSorted(ComfyGridGroup.sortGroupsByPriority);
    }
  });

  const commonTabBoard = $derived(
    (appState.optionState.get('ComfyGrid.ui.common_tab_board') as boolean) ?? false,
  );
  const effectiveGroupId = $derived(commonTabBoard ? undefined : group?.id);
  const showBoard = $derived(
    (!commonTabBoard || !group) && workspaceState.hasEffectiveNodes('Tab', effectiveGroupId),
  );
</script>

<div bind:clientWidth={containerWidth}>
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
</div>
