<script lang="ts">
  import { SlidersHorizontal } from '@lucide/svelte';
  import AppMenu from '@/components/common/AppMenu.svelte';
  import { t } from '@/i18n/i18n';
  import { saveLayoutObject } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridGroup } from '@/states/model-state.svelte';
  import type { MenuEntry } from '@/types/menu';
  import { COMFY_NODE_MODE } from '@/types/model-shared';
  import InnerTab from '../common/InnerTab.svelte';
  import InnerTabContainer from '../common/InnerTabContainer.svelte';
  import Gallery from '../sections/Gallery.svelte';
  import GridStackBoard from '../sections/GridStackBoard.svelte';
  import SplitPane from '../sections/SplitPane.svelte';
  import WidgetsSection from '../sections/WidgetsSection.svelte';
  import SystemMonitorGroup from '../widgets/SystemMonitorGroup.svelte';

  const uiState = appState.uiState;
  const workspaceState = appState.workspaceState;
  const optionState = appState.optionState;

  const sortedGroups = $derived.by(() => {
    return workspaceState.groups.toSorted(ComfyGridGroup.sortGroupsByPriority);
  });

  const systemMonitor = $derived(optionState.get('ComfyGrid.ui.system_monitor'));

  const hasGlobalFloatingItems = $derived(workspaceState.hasEffectiveNodes('Global'));

  function handleOptionChanged() {
    saveLayoutObject(workspaceState.layout);
  }

  const displayOptions = [
    ['commonTabBoard', 'group.toggle_common_tab_board.label'],
    ['showNoteNodes', 'group.toggle_show_note_nodes.label'],
    ['showCollapsedNodes', 'group.toggle_show_collapsed_nodes.label'],
    ['showControlLessNodes', 'group.toggle_show_control_less_nodes.label'],
    ['showRenderableLessNodes', 'group.toggle_show_renderable_less_nodes.label'],
  ] as const;
  const menuItems = $derived.by((): MenuEntry[] => {
    if (!workspaceState.layout) return [];
    const items: MenuEntry[] = displayOptions.map(([key, label]) => ({
      id: key,
      kind: 'checkbox',
      label: $t(label),
      checked: workspaceState.layout[key],
      onCheckedChange: (checked) => {
        workspaceState.layout.setDisplayOption(key, checked);
        handleOptionChanged();
      },
    }));
    items.splice(1, 0, { id: 'separator', kind: 'separator' });
    return items;
  });

  function getTabClassNames(tabId: string) {
    const classNames: string[] = [];

    if (workspaceState.isTabExecuting(tabId)) {
      classNames.push('executing');
    }
    if (workspaceState.hasTabError(tabId)) {
      classNames.push('is-invalid');
    }

    const modeSet = workspaceState.getTabModeSet(tabId);
    if (modeSet.size === 1) {
      const [mode] = modeSet;
      if (mode === COMFY_NODE_MODE.BYPASS) {
        classNames.push('bypass');
      } else if (mode === COMFY_NODE_MODE.MUTE) {
        classNames.push('mute');
      }
    }

    return classNames;
  }
</script>

<div
  id="grid-page"
  class="h-100 vstack px-1"
  style:display={uiState.activePageId === 'grid' ? '' : 'none'}
>
  <div class="d-flex flex-grow-1">
    {#if systemMonitor === 'left'}
      <SystemMonitorGroup
        showCores={true}
        className="vstack gap-1 pt-1 pe-1"
        style="width: 162px; max-width: 162px; min-width: 162px;"
      />
    {/if}
    <div class="flex-grow-1" style="min-width: 0;">
      <GridStackBoard boardId="Global"></GridStackBoard>
      <hr class:no-border={!hasGlobalFloatingItems} />
      {#if workspaceState.layout}
        <SplitPane sizes={[70, 30]}>
          <div class="px-1">
            <div
              class="d-flex align-items-baseline gap-2 px-1 sticky-top"
              style="background-color: var(--bs-body-bg);"
            >
              <ul class="nav nav-tabs flex-grow-1">
                {#if workspaceState.hasTabContent('__ungrouped__')}
                  <InnerTab
                    id="__ungrouped__"
                    classNames={getTabClassNames('__ungrouped__')}
                    text="Nodes"
                    bind:activeTabId={uiState.activeGridTabId}
                  />
                {/if}
                {#each sortedGroups.filter((g) => g.isTabify && workspaceState.hasTabContent(g.id)) as group (group.id)}
                  <InnerTab
                    id={group.id}
                    classNames={getTabClassNames(group.id)}
                    text={group.title}
                    bind:activeTabId={uiState.activeGridTabId}
                  />
                {/each}
              </ul>
              <div class="d-flex gap-2 align-items-center">
                <select
                  class="form-select form-select-sm"
                  onchange={handleOptionChanged}
                  bind:value={workspaceState.layout.sortOrder}
                >
                  <option value="default">{$t('group.sort.default')}</option>
                  <option value="name">{$t('group.sort.name')}</option>
                </select>

                <AppMenu items={menuItems} align="end">
                  {#snippet trigger({ props })}
                    <button
                      {...props}
                      class="dropdown-toggle btn btn-outline-secondary d-flex justify-content-center align-items-center p-1"
                      type="button"
                      aria-label={$t('menu.grid_options')}
                      ><SlidersHorizontal size={14} />
                    </button>
                  {/snippet}
                </AppMenu>
              </div>
            </div>
            <div class="py-2">
              {#if workspaceState.hasTabContent('__ungrouped__')}
                {#if '__ungrouped__' == uiState.activeGridTabId}
                  <InnerTabContainer>
                    <WidgetsSection />
                  </InnerTabContainer>
                {/if}
              {/if}
              {#each workspaceState.groups as group (group.id)}
                {#if group.isTabify && workspaceState.hasTabContent(group.id)}
                  {#if group.id == uiState.activeGridTabId}
                    <InnerTabContainer>
                      <WidgetsSection {group} />
                    </InnerTabContainer>
                  {/if}
                {/if}
              {/each}
            </div>
          </div>
          <div class="sticky-top align-self-start">
            <Gallery />
          </div>
        </SplitPane>
      {/if}
    </div>
  </div>

  <div class="container d-flex justify-content-center gap-3 py-4">
    {#each ['branch', 'commit', 'tag', 'date', 'comitter'] as key (key)}
      <span>
        <span class="key">{key}:</span>
        <span class="val">{appState.version[key as keyof typeof appState.version]}</span>
      </span>
    {/each}
  </div>
</div>

<style lang="scss">
  hr {
    margin: 0.5rem 0 0.75rem 0;
    &.no-border {
      border: none;
      margin: 0.25rem 0;
    }
  }
</style>
