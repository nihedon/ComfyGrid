<script lang="ts">
  import {
    IconFileExport,
    IconFileImport,
    IconMenu2,
    IconReload,
    IconSettings,
  } from '@tabler/icons-svelte';
  import { t } from '@/i18n/i18n';
  import { workflowManager } from '@/managers/workflow-manager';
  import { openLayout } from '@/services/gridstack-service';
  import { refreshModels } from '@/services/models-service';
  import { appState } from '@/states/app-state.svelte';

  const workspaceState = appState.workspaceState;

  function handleClickReloadGraph() {
    workflowManager.loadCurrentWorkflow();
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
    ><IconMenu2 size={18} />
  </button>

  <ul class="dropdown-menu">
    <li>
      <button class="dropdown-item d-flex align-items-center gap-2" onclick={handleClickOpenSetup}>
        <IconSettings size={16} />{$t('menu.setup')}
      </button>
    </li>
    <li><hr class="dropdown-divider" /></li>
    <li>
      <button
        class="dropdown-item d-flex align-items-center gap-2"
        onclick={handleClickReloadGraph}
      >
        <IconReload size={16} />{$t('menu.reload')}
      </button>
    </li>
    <li><hr class="dropdown-divider" /></li>
    <li>
      <button
        class="dropdown-item d-flex align-items-center gap-2"
        onclick={handleRefreshComboInNodes}
        ><span class="ps-4">{$t('menu.update_request')}</span></button
      >
    </li>
    <li><hr class="dropdown-divider" /></li>
    <li>
      <button
        class="dropdown-item d-flex align-items-center gap-2"
        onclick={handleClickImportLayout}><IconFileImport size={16} />{$t('menu.import')}</button
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
        ><IconFileExport size={16} />{$t('menu.export.all')}</button
      >
    </li>
  </ul>
</div>

<style lang="scss">
  .dropdown-toggle::after {
    display: none;
  }
</style>
