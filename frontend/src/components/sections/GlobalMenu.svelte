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
  import AppMenu from '@/components/common/AppMenu.svelte';
  import { t } from '@/i18n/i18n';
  import { workflowManager } from '@/managers/workflow-manager';
  import { openLayout } from '@/services/gridstack-service';
  import { refreshModels } from '@/services/models-service';
  import { appState } from '@/states/app-state.svelte';
  import type { MenuEntry } from '@/types/menu';
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

  let isRefreshing = $state(false);

  async function handleRefreshComboInNodes() {
    if (isRefreshing) return;
    isRefreshing = true;
    const app = appState.comfyUiState.app;
    appState.toastState.addToast({ type: 'info', message: $t('toast.update_requested') });
    try {
      if (!app) throw new Error('ComfyUI is not available');
      await app.refreshComboInNodes();
      await workflowManager.loadCurrentWorkflow();
      await refreshModels('models');
      appState.toastState.addToast({
        type: 'success',
        message: $t('toast.update_request_completed'),
      });
    } catch (error) {
      logger.error('Failed to refresh models:', error);
      appState.toastState.addToast({ type: 'error', message: $t('toast.update_request_failed') });
    } finally {
      isRefreshing = false;
    }
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

  const items = $derived<MenuEntry[]>([
    {
      id: 'reload-graph',
      kind: 'action',
      label: $t('menu.reload_workflow'),
      icon: Workflow,
      onSelect: handleClickReloadGraph,
    },
    {
      id: 'models',
      kind: 'action',
      label: $t('menu.update_request'),
      icon: ListRestart,
      disabled: isRefreshing,
      onSelect: handleRefreshComboInNodes,
    },
    {
      id: 'reload',
      kind: 'action',
      label: $t('menu.comfyui.reload'),
      icon: RotateCw,
      onSelect: handleReload,
    },
    {
      id: 'restart',
      kind: 'action',
      label: $t('menu.comfyui.restart'),
      icon: Power,
      disabled: isRestarting,
      onSelect: handleRestart,
    },
    { id: 'files', kind: 'separator' },
    {
      id: 'import',
      kind: 'action',
      label: $t('menu.import'),
      icon: FileDown,
      onSelect: handleClickImportLayout,
    },
    {
      id: 'workflow',
      kind: 'action',
      label: $t('menu.export.workflow'),
      onSelect: handleClickExportWorkflow,
    },
    {
      id: 'layout',
      kind: 'action',
      label: $t('menu.export.layout'),
      onSelect: handleClickExportLayout,
    },
    {
      id: 'all',
      kind: 'action',
      label: $t('menu.export.all'),
      icon: FileUp,
      onSelect: handleClickExportAll,
    },
    { id: 'setup-separator', kind: 'separator' },
    {
      id: 'setup',
      kind: 'action',
      label: $t('menu.setup'),
      icon: Settings,
      onSelect: handleClickOpenSetup,
    },
  ]);
</script>

<AppMenu {items}>
  {#snippet trigger({ props })}
    <button
      {...props}
      class="dropdown-toggle btn btn-outline-secondary d-flex justify-content-center align-items-center p-1"
      type="button"
      aria-label={$t('menu.title')}
      style="width: 2.2rem; height: 2.2rem;"
      ><Menu size={18} />
    </button>
  {/snippet}
</AppMenu>

<style lang="scss">
  .dropdown-toggle::after {
    display: none;
  }
</style>
