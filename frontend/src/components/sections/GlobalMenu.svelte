<script lang="ts">
  import {
    FileDown,
    FileUp,
    ListRestart,
    Menu,
    Power,
    RotateCw,
    Settings,
    Workflow,
  } from '@lucide/svelte';
  import { comfyGridApiClient } from '@/api/api-client';
  import { t } from '@/i18n/i18n';
  import { workflowManager } from '@/managers/workflow-manager';
  import { openLayout } from '@/services/gridstack-service';
  import { refreshModels } from '@/services/models-service';
  import { appState } from '@/states/app-state.svelte';
  import logger from '@/utils/logger';

  const workspaceState = appState.workspaceState;

  function handleClickReloadGraph() {
    workflowManager.loadCurrentWorkflow();
  }

  function handleReload() {
    if (appState.comfyUiState.iframe) {
      appState.comfyUiState.iframe.src = appState.comfyUiState.iframe.src;
    }
  }

  let isRestarting = $state(false);
  async function handleRestart() {
    isRestarting = true;
    if (!(await comfyGridApiClient.postRestart())) {
      logger.error('Failed to restart ComfyUI');
    }
    isRestarting = false;
  }

  function handleRefreshComboInNodes() {
    const app = appState.comfyUiState.app;
    appState.toastState.addToast({ type: 'info', message: $t('toast.update_requested') });
    app?.refreshComboInNodes().then(async () => {
      await workflowManager.loadCurrentWorkflow();
      await refreshModels('models');
      appState.toastState.addToast({
        type: 'success',
        message: $t('toast.update_request_completed'),
      });
    });
  }

  function handleClickImportLayout() {
    openLayout();
  }

  function handleClickExportLayout() {
    workflowManager.exportLayout();
  }

  function handleClickExportWorkflow() {
    const app = appState.comfyUiState.app;
    const workflow = app?.rootGraph?.serialize();
    if (workflow) {
      workflowManager.exportWorkflow(workflow);
    }
  }

  function handleClickExportAll() {
    if (workspaceState.layout) {
      const app = appState.comfyUiState.app;
      const workflow = app?.rootGraph?.serialize();
      if (workflow) {
        workflowManager.exportAll(workflow);
      }
    }
  }

  function handleClickOpenSetup() {
    window.dispatchEvent(new CustomEvent('comfygrid:open_setup'));
  }
</script>

<div class="dropdown">
  <button
    class="dropdown-toggle btn btn-outline-secondary d-flex justify-content-center align-items-center p-1"
    type="button"
    data-bs-toggle="dropdown"
    aria-expanded="false"
    style="width: 2.2rem; height: 2.2rem;"
    ><Menu size={18} />
  </button>

  <ul class="dropdown-menu">
    <li>
      <button
        class="dropdown-item d-flex align-items-center gap-2"
        onclick={handleClickReloadGraph}
      >
        <Workflow size={14} />{$t('menu.reload_workflow')}
      </button>
    </li>
    <li>
      <button
        class="dropdown-item d-flex align-items-center gap-2"
        onclick={handleRefreshComboInNodes}
        ><ListRestart size={14} />{$t('menu.update_request')}</button
      >
    </li>
    <li>
      <button class="dropdown-item d-flex align-items-center gap-2" onclick={handleReload}>
        <RotateCw size={14} />{$t('menu.comfyui.reload')}
      </button>
    </li>
    <li>
      <button
        class="dropdown-item d-flex align-items-center gap-2"
        onclick={handleRestart}
        disabled={isRestarting}
      >
        <Power size={14} />{$t('menu.comfyui.restart')}
      </button>
    </li>
    <li><hr class="dropdown-divider" /></li>
    <li>
      <button
        class="dropdown-item d-flex align-items-center gap-2"
        onclick={handleClickImportLayout}><FileDown size={14} />{$t('menu.import')}</button
      >
    </li>
    <li>
      <button
        class="dropdown-item d-flex align-items-center gap-2"
        onclick={handleClickExportWorkflow}
        ><span class="ps-4">{$t('menu.export.workflow')}</span></button
      >
    </li>
    <li>
      <button
        class="dropdown-item d-flex align-items-center gap-2"
        onclick={handleClickExportLayout}
      >
        <span class="ps-4">{$t('menu.export.layout')}</span></button
      >
    </li>
    <li>
      <button class="dropdown-item d-flex align-items-center gap-2" onclick={handleClickExportAll}
        ><FileUp size={14} />{$t('menu.export.all')}</button
      >
    </li>
    <li><hr class="dropdown-divider" /></li>
    <li>
      <button class="dropdown-item d-flex align-items-center gap-2" onclick={handleClickOpenSetup}>
        <Settings size={14} />{$t('menu.setup')}
      </button>
    </li>
  </ul>
</div>

<style lang="scss">
  .dropdown-toggle::after {
    display: none;
  }
</style>
