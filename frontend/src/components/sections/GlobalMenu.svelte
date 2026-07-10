<script lang="ts">
  import { t } from '@/i18n/i18n';
  import { workflowManager } from '@/managers/workflow-manager';
  import { openLayout } from '@/services/gridstack-service';
  import { refreshModels } from '@/services/models-service';
  import { appState } from '@/states/app-state.svelte';

  const workspaceState = appState.workspaceState;

  function handleClickReloadGraph() {
    appState.bridge?.getWorkflow()?.then((res) => {
      workflowManager.handleWorkflow(res);
    });
  }

  function handleRefreshComboInNodes() {
    const app = appState.comfyUiState.app;
    appState.toastState.addToast({ type: 'info', message: $t('toast.update_requested') });
    app?.refreshComboInNodes().then(async () => {
      const res = await appState.bridge?.getWorkflow();
      if (res) {
        workflowManager.handleWorkflow(res);
      }
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
    const workflow = app?.graph?.serialize();
    if (workflow) {
      workflowManager.exportWorkflow(workflow);
    }
  }

  function handleClickExportAll() {
    if (workspaceState.layout) {
      const app = appState.comfyUiState.app;
      const workflow = app?.graph?.serialize();
      if (workflow) {
        workflowManager.exportAll(workflow);
      }
    }
  }
</script>

<div class="dropdown">
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button
    class="dropdown-toggle btn btn-outline-secondary d-flex justify-content-center align-items-center"
    type="button"
    data-bs-toggle="dropdown"
    aria-expanded="false"
    style="width: 2.2rem; height: 2.2rem;"
    ><i class="pi pi-bars"></i>
  </button>

  <ul class="dropdown-menu">
    <li>
      <button class="dropdown-item" onclick={handleClickReloadGraph}>
        <i class="pi pi-sync"></i>{$t('menu.reload')}
      </button>
    </li>
    <li><hr class="dropdown-divider" /></li>
    <li>
      <button class="dropdown-item" onclick={handleRefreshComboInNodes}
        ><i></i>{$t('menu.update_request')}</button
      >
    </li>
    <li><hr class="dropdown-divider" /></li>
    <li>
      <button class="dropdown-item" onclick={handleClickImportLayout}
        ><i class="pi pi-file-import"></i>{$t('menu.import')}</button
      >
    </li>
    <li>
      <button class="dropdown-item" onclick={handleClickExportWorkflow}
        ><i></i>{$t('menu.export.workflow')}</button
      >
    </li>
    <li>
      <button class="dropdown-item" onclick={handleClickExportLayout}>
        <i></i>{$t('menu.export.layout')}</button
      >
    </li>
    <li>
      <button class="dropdown-item" onclick={handleClickExportAll}
        ><i class="pi pi-file-export"></i>{$t('menu.export.all')}</button
      >
    </li>
  </ul>
</div>

<style lang="scss">
  button > i {
    width: 2rem;
    display: inline-block;
  }

  .dropdown-toggle::after {
    display: none;
  }
</style>
