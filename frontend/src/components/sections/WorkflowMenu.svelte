<script lang="ts">
  import { Workflow } from '@lucide/svelte';
  import AppMenu from '@/components/common/AppMenu.svelte';
  import { t } from '@/i18n/i18n';
  import { appState } from '@/states/app-state.svelte';
  import type { OpenWorkflowInfo } from '@/types/comfy-workflow';
  import type { MenuEntry } from '@/types/menu';
  import logger from '@/utils/logger';

  const uiState = appState.uiState;

  let workflowTabs = $state<OpenWorkflowInfo[]>([]);
  let isSwitching = $state(false);

  function refreshWorkflowTabs() {
    workflowTabs = appState.bridge?.getOpenWorkflows() ?? [];
  }

  async function handleSelectTab(item: OpenWorkflowInfo) {
    if (item.selected || isSwitching) return;

    const app = appState.comfyUiState.app;
    const bridge = appState.bridge;
    if (!app || !bridge) return;
    isSwitching = true;
    try {
      await bridge.selectWorkflow(item.path);
      if (appState.comfyUiState.app !== app) return;
      refreshWorkflowTabs();
      if (uiState.activePageId !== 'grid' && uiState.activePageId !== 'comfyui') {
        uiState.needRefresh = true;
      }
    } catch (error) {
      if (appState.comfyUiState.app !== app) return;
      logger.error('Failed to switch ComfyUI workflow tab:', error);
      appState.toastState.addToast({ type: 'error', message: $t('toast.workflow_apply_failed') });
    } finally {
      isSwitching = false;
    }
  }
  const items = $derived(
    workflowTabs.map((item): MenuEntry => ({
      id: item.path,
      kind: 'action',
      label: item.name,
      selected: item.selected,
      disabled: isSwitching,
      onSelect: () => handleSelectTab(item),
    })),
  );
</script>

<AppMenu
  {items}
  onOpenChange={(open) => {
    if (open) refreshWorkflowTabs();
  }}
>
  {#snippet trigger({ props })}
    <button
      {...props}
      class="dropdown-toggle btn btn-outline-secondary d-flex justify-content-center align-items-center p-1"
      type="button"
      aria-label={$t('menu.workflows')}
      style="width: 2.2rem; height: 2.2rem;"
      ><Workflow size={18} />
    </button>
  {/snippet}
</AppMenu>

<style lang="scss">
  .dropdown-toggle::after {
    display: none;
  }
</style>
