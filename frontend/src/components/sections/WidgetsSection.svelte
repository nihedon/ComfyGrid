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

  const commonTabBoard = $derived(workspaceState.layout.commonTabBoard);
  const effectiveGroupId = $derived(commonTabBoard ? undefined : group?.id);
  const showBoard = $derived(
    (!commonTabBoard || !group) &&
      workspaceState.hasEffectiveNodes(
        'Tab',
        commonTabBoard ? undefined : (effectiveGroupId ?? '__ungrouped__'),
      ),
  );
</script>

{#snippet tabBoard()}
  <div>
    <GridStackBoard boardId="Tab" groupId={effectiveGroupId} />
    <hr />
  </div>
{/snippet}

<div bind:clientWidth={containerWidth}>
  {#if showBoard && !group}
    {@render tabBoard()}
  {/if}
  <div class="vstack gap-2">
    {#each sortedGroups as g (g.id)}
      {#snippet widgetGroup()}
        <NodeWidgetGroup
          group={g}
          {columnCount}
          alwaysExpanded={!g.id || group !== undefined}
          leadingContent={group && showBoard ? tabBoard : undefined}
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

<style lang="scss">
  hr {
    margin: 0.5rem 0 0.25rem 0;
  }
</style>
