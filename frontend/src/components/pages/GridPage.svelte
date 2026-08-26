<script lang="ts">
  import { SlidersHorizontal } from '@lucide/svelte';
  import { t } from '@/i18n/i18n';
  import { saveLayoutObject } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridGroup } from '@/states/model-state.svelte';
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

  let activeTabId: string = $state('__ungrouped__');
  let tabContainer = $state<HTMLElement>();

  const sortedGroups = $derived.by(() => {
    return workspaceState.groups.toSorted(ComfyGridGroup.sortGroupsByPriority);
  });

  const systemMonitor = $derived(optionState.get('ComfyGrid.ui.system_monitor'));

  const hasGlobalFloatingItems = $derived.by(() => {
    if (!workspaceState.layout) return false;
    for (const boardId of workspaceState.layout.floatingNodes.values()) {
      if (boardId === 'Global' || boardId.startsWith('Global-')) {
        return true;
      }
    }
    for (const boardId of workspaceState.layout.floatingWidgets.values()) {
      if (boardId === 'Global' || boardId.startsWith('Global-')) {
        return true;
      }
    }
    return false;
  });

  function handleOptionChanged() {
    saveLayoutObject(workspaceState.layout);
  }

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
                    bind:activeTabId
                  />
                {/if}
                {#each sortedGroups.filter((g) => g.isTabify && workspaceState.hasTabContent(g.id)) as group (group.id)}
                  <InnerTab
                    id={group.id}
                    classNames={getTabClassNames(group.id)}
                    text={group.title}
                    bind:activeTabId
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

                <div class="dropdown">
                  <button
                    class="dropdown-toggle btn btn-outline-secondary d-flex justify-content-center align-items-center p-1"
                    type="button"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                    ><SlidersHorizontal size={14} />
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li>
                      <input
                        type="checkbox"
                        class="btn-check"
                        id="toggle-note-nodes"
                        name="toggle_note_nodes"
                        onchange={handleOptionChanged}
                        bind:checked={workspaceState.layout.showNoteNodes}
                      />
                      <label
                        class="dropdown-item"
                        class:active={workspaceState.layout.showNoteNodes}
                        for="toggle-note-nodes"
                      >
                        {$t('group.toggle_show_note_nodes.label')}
                      </label>
                    </li>
                    <li>
                      <input
                        type="checkbox"
                        class="btn-check"
                        id="toggle-collapsed-nodes"
                        name="toggle_collapsed_nodes"
                        onchange={handleOptionChanged}
                        bind:checked={workspaceState.layout.showCollapsedNodes}
                      />
                      <label
                        class="dropdown-item"
                        class:active={workspaceState.layout.showCollapsedNodes}
                        for="toggle-collapsed-nodes"
                      >
                        {$t('group.toggle_show_collapsed_nodes.label')}
                      </label>
                    </li>
                    <li>
                      <input
                        type="checkbox"
                        class="btn-check"
                        id="toggle-controlless-nodes"
                        name="toggle_controlless_nodes"
                        onchange={handleOptionChanged}
                        bind:checked={workspaceState.layout.showControlLessNodes}
                      />
                      <label
                        class="dropdown-item"
                        class:active={workspaceState.layout.showControlLessNodes}
                        for="toggle-controlless-nodes"
                      >
                        {$t('group.toggle_show_control_less_nodes.label')}
                      </label>
                    </li>
                    <li>
                      <input
                        type="checkbox"
                        class="btn-check"
                        id="toggle-renderable-less-nodes"
                        name="toggle_renderable_less_nodes"
                        onchange={handleOptionChanged}
                        bind:checked={workspaceState.layout.showRenderableLessNodes}
                      />
                      <label
                        class="dropdown-item"
                        class:active={workspaceState.layout.showRenderableLessNodes}
                        for="toggle-renderable-less-nodes"
                      >
                        {$t('group.toggle_show_renderable_less_nodes.label')}
                      </label>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div class="py-2" bind:this={tabContainer}>
              {#if workspaceState.hasTabContent('__ungrouped__')}
                <InnerTabContainer tabId="__ungrouped__" {activeTabId}>
                  <WidgetsSection container={tabContainer} />
                </InnerTabContainer>
              {/if}
              {#each workspaceState.groups as group (group.id)}
                {#if group.isTabify && workspaceState.hasTabContent(group.id)}
                  <InnerTabContainer tabId={group.id} {activeTabId}>
                    <WidgetsSection container={tabContainer} {group} />
                  </InnerTabContainer>
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
    margin: 0.5rem 0;
    &.no-border {
      border: none;
      margin: 0.25rem 0;
    }
  }
</style>
