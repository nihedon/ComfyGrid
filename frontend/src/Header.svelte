<script lang="ts">
  import Page from '@/components/pages/PageTab.svelte';
  import ActionForm from '@/components/sections/ActionPanel.svelte';
  import MenuForm from '@/components/sections/GlobalMenu.svelte';
  import ProgressBar from '@/components/sections/ProgressBar.svelte';
  import { t } from '@/i18n/i18n';
  import { importLayout } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import logger from '@/utils/logger';
  import { comfyGridApiClient } from './api/api-client';
  import SystemMonitorGroup from './components/widgets/SystemMonitorGroup.svelte';
  import { workflowManager } from './managers/workflow-manager';

  const toastState = appState.toastState;
  const workspaceState = appState.workspaceState;
  const uiState = appState.uiState;
  const optionState = appState.optionState;

  const systemMonitor = $derived(
    optionState.opts.get('system_monitor') ?? optionState.forms.get('system_monitor')?.default,
  );

  function isValidDragData(e: DragEvent): boolean {
    const types = e.dataTransfer?.types || [];
    // Accept files or HTML (for img drag from browser)
    return types.includes('Files') || types.includes('text/html');
  }

  async function handleDrop(e: DragEvent) {
    uiState.isDragging = false;
    if (!isValidDragData(e)) {
      return;
    }
    e.preventDefault();

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    const fileName = file.name.toLowerCase();

    // Handle JSON files directly
    if (/\.(json|txt)$/i.test(fileName)) {
      try {
        const text = await file.text();
        const workflow = JSON.parse(text);
        const keySize = Object.keys(workflow).length;
        if (keySize > 0) {
          if (keySize > 1) {
            await loadWorkflow(fileName, workflow);
          } else {
            toastState.addToast({ type: 'warning', message: $t('toast.no_workflow_found') });
          }
          if (workflow.comfygrid) {
            importLayout(JSON.stringify(workflow.comfygrid));
            toastState.addToast({ type: 'success', message: $t('toast.layout_applied') });
          } else {
            toastState.addToast({ type: 'info', message: $t('toast.no_layout_found') });
          }
        } else {
          toastState.addToast({ type: 'error', message: $t('toast.metadata_load_failed') });
        }
      } catch (error) {
        logger.error('Failed to read JSON file:', error);
        toastState.addToast({ type: 'error', message: $t('toast.metadata_load_failed') });
      }
      return;
    }

    // Handle image files
    if (!/\.(png|jfif|pjpeg|jpeg|pjp|jpg|webp|mp4|webm|m4v|mkv)$/i.test(fileName)) {
      toastState.addToast({ type: 'warning', message: $t('toast.unsupported_file_type') });
      return;
    }

    // Send image file to backend for metadata extraction
    const formData = new FormData();
    formData.append('file', file);

    const res = await comfyGridApiClient.postImageInfo(file);
    if (res.ok) {
      if (res.json.workflow) {
        await loadWorkflow(fileName, JSON.parse(res.json.workflow));
      } else {
        toastState.addToast({ type: 'error', message: $t('toast.metadata_load_failed') });
      }
    } else {
      toastState.addToast({ type: 'warning', message: $t('toast.no_workflow_found') });
    }
  }

  async function loadWorkflow(fileName: string, workflowJson: { [key: string]: unknown }) {
    const ret = await appState.bridge?.loadWorkflow({
      filename: fileName,
      json: workflowJson,
    });
    if (ret?.success) {
      logger.log('Workflow applied successfully');
      toastState.addToast({ type: 'success', message: $t('toast.workflow_applied') });
      const res = await appState.bridge?.getWorkflow();
      if (res) {
        workflowManager.handleWorkflow(res);
      }
    } else {
      logger.error('Failed to apply workflow:', ret?.error);
      toastState.addToast({ type: 'error', message: $t('toast.workflow_apply_failed') });
    }
  }
</script>

<div class="p-0 w-100">
  <div class="flex-column position-relative">
    <ProgressBar />
    <div class="d-flex align-items-center pt-2 gap-2">
      <div class="ps-2" style="z-index: 1030;">
        <MenuForm />
      </div>
      <ul class="nav nav-tabs navbar-expand-lg flex-row flex-grow-1">
        <Page id="grid" text="Grid" title={workspaceState.layout?.graphId} />
        <Page id="comfyui" text="ComfyUI" />
        <Page id="model" text="Model" />
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
      ondrop={handleDrop}
    >
      <div class="drop-content text-center">
        <i class="pi pi-download"></i>
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
