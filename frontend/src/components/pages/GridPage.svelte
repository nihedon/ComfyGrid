<script lang="ts">
  import { t } from '@/i18n/i18n';
  import { saveLayoutObject } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridGroup } from '@/states/model-state.svelte';
  import Tab from '../common/InnerTab.svelte';
  import TabContainer from '../common/InnerTabContainer.svelte';
  import Gallery from '../sections/Gallery.svelte';
  import GridStackBoard from '../sections/GridStackBoard.svelte';
  import SplitPane from '../sections/SplitPane.svelte';
  import WidgetsSection from '../sections/WidgetsSection.svelte';
  import SystemMonitor from '../widgets/SystemMonitor.svelte';

  const uiState = appState.uiState;
  const workspaceState = appState.workspaceState;
  const optionState = appState.optionState;

  let activeTabId: string = $state('nodes');
  let tabContainer = $state<HTMLElement>();

  const sortedGroups = $derived.by(() => {
    return workspaceState.groups.toSorted(ComfyGridGroup.sortGroupsByPriority);
  });

  const systemMonitor = $derived(
    optionState.opts.get('system_monitor') ?? optionState.forms.get('system_monitor')?.default,
  );

  function handleOptionChanged() {
    saveLayoutObject(workspaceState.layout);
  }

  function isExecutingGroup(group: ComfyGridGroup): boolean {
    const executing = group.nodes.some((n) => appState.executionState.runningNodeId === n.id);
    if (executing) {
      return true;
    }
    return group.children.some((g) => isExecutingGroup(g));
  }

  function hasErrorGroup(group: ComfyGridGroup): boolean {
    const hasError = group.nodes.some((n) => workspaceState.hasErrorNode(n.id));
    if (hasError) {
      return true;
    }
    return group.children.some((g) => hasErrorGroup(g));
  }

  function tabClass(group: ComfyGridGroup) {
    const classNames = [];
    if (isExecutingGroup(group)) {
      classNames.push('executing');
    }
    if (hasErrorGroup(group)) {
      classNames.push('is-invalid');
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
      <div class="vstack gap-1 pt-1 pe-1" style="width: 162px; max-width: 162px; min-width: 162px;">
        <SystemMonitor monitorType="cpu" showCores={true} />
        <SystemMonitor monitorType="ram" />
        <SystemMonitor monitorType="gpu" />
        <SystemMonitor monitorType="vram" />
        <SystemMonitor monitorType="temp" />
      </div>
    {/if}
    <div class="flex-grow-1" style="min-width: 0;">
      <GridStackBoard boardId="Global"></GridStackBoard>
      <hr />
      {#if workspaceState.layout}
        <SplitPane sizes={[70, 30]}>
          <div class="px-1">
            <div class="d-flex gap-3 mb-1 px-1">
              <div>
                <input
                  type="checkbox"
                  class="form-check-input"
                  id="toggle-collapsed-nodes"
                  name="toggle_no_collapsed_nodes"
                  onchange={handleOptionChanged}
                  bind:checked={workspaceState.layout.noCollapsedNodes}
                />
                <label class="form-check-label" for="toggle-collapsed-nodes">
                  {$t('group.toggle_no_collapsed_nodes.label')}
                </label>
              </div>
              <div>
                <input
                  type="checkbox"
                  class="form-check-input"
                  id="toggle-no-control-nodes"
                  name="toggle_no_control_nodes"
                  onchange={handleOptionChanged}
                  bind:checked={workspaceState.layout.noControlNodes}
                />
                <label class="form-check-label" for="toggle-no-control-nodes">
                  {$t('group.toggle_no_control_nodes.label')}
                </label>
              </div>
              <div class="ms-auto">
                <select
                  class="form-select form-select-sm"
                  onchange={handleOptionChanged}
                  bind:value={workspaceState.layout.sortOrder}
                >
                  <option value="default">{$t('group.sort.default')}</option>
                  <option value="name">{$t('group.sort.name')}</option>
                </select>
              </div>
            </div>
            <ul class="nav nav-tabs sticky-top" style="background-color: var(--bs-body-bg);">
              <Tab id="nodes" text="Nodes" bind:activeTabId />
              {#each sortedGroups.filter((g) => g.isTabify) as group (group.id)}
                <Tab
                  id={group.id}
                  classNames={tabClass(group)}
                  text={group.title}
                  bind:activeTabId
                />
              {/each}
            </ul>
            <div class="py-2" bind:this={tabContainer}>
              <TabContainer tabId="nodes" {activeTabId}>
                <WidgetsSection container={tabContainer} />
              </TabContainer>
              {#each workspaceState.groups as group (group.id)}
                {#if group.isTabify}
                  <TabContainer tabId={group.id} {activeTabId}>
                    <WidgetsSection container={tabContainer} groupId={group.id} />
                  </TabContainer>
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
