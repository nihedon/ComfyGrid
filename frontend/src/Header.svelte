<script lang="ts">
  import { Download } from '@lucide/svelte';
  import Page from '@/components/pages/PageTab.svelte';
  import ActionForm from '@/components/sections/ActionPanel.svelte';
  import GlobalMenu from '@/components/sections/GlobalMenu.svelte';
  import ProgressBar from '@/components/sections/ProgressBar.svelte';
  import { fileManager } from '@/managers/file-manager';
  import { appState } from '@/states/app-state.svelte';
  import WorkflowMenu from './components/sections/WorkflowMenu.svelte';
  import SystemMonitorGroup from './components/widgets/SystemMonitorGroup.svelte';

  const workspaceState = appState.workspaceState;
  const uiState = appState.uiState;
  const optionState = appState.optionState;

  const systemMonitor = $derived(optionState.get('ComfyGrid.ui.system_monitor'));
</script>

<div class="p-0 w-100">
  <div class="flex-column position-relative">
    <ProgressBar />
    <div class="d-flex align-items-center pt-2 gap-2">
      <div class="ps-2 d-flex gap-2">
        <GlobalMenu />
        <WorkflowMenu />
      </div>
      <ul class="nav nav-tabs navbar-expand-lg flex-row flex-grow-1">
        <Page id="grid" text="Grid" title={workspaceState.layout?.graphId} />
        <Page id="comfyui" text="ComfyUI" />
        <Page id="model" text="File" />
        <Page id="image-info" text="Image Info" />
        <Page id="settings" text="Settings" />
      </ul>
      {#if systemMonitor === 'top'}
        <SystemMonitorGroup simple className="d-flex gap-1" style="height: 32px;" />
      {/if}
      <div class="ms-auto pe-3 z-1">
        <ActionForm />
      </div>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="drop-overlay position-absolute top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center"
      class:visible={uiState.isDragging}
      ondragover={(e) => e.preventDefault()}
      ondrop={(e) => fileManager.handleDrop(e)}
    >
      <div class="drop-content text-center">
        <Download size={32} />
        <div>Drop here to load workflow</div>
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .drop-overlay {
    background-color: rgba(0, 0, 0, 0.7);
    z-index: 1030;
    pointer-events: none;
    visibility: hidden;
    outline: 3px dashed white;
    outline-offset: -4px;

    &.visible {
      visibility: visible;
      pointer-events: auto;
    }

    .drop-content {
      font-size: 1.2rem;
      color: white;
    }
  }
</style>
