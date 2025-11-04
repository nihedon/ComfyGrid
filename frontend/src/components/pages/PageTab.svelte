<script lang="ts">
  import { t } from '@/i18n/i18n';
  import { workflowManager } from '@/managers/workflow-manager';
  import { appState } from '@/states/app-state.svelte';
  import logger from '@/utils/logger';

  let {
    id,
    text,
    title,
  }: {
    id: 'grid' | 'comfyui' | 'model' | 'image-info' | 'settings';
    text: string;
    title?: string;
  } = $props();

  const uiState = appState.uiState;

  const isActive = $derived(uiState.activePageId === id);
  const hasSubmenu = $derived(id === 'comfyui');

  const comfyUiState = appState.comfyUiState;

  function changeActiveTab() {
    uiState.activePageId = id;
    if (id === 'comfyui') {
      uiState.needRefresh = true;
    } else if (id === 'grid' && uiState.needRefresh) {
      uiState.needRefresh = false;
      appState.bridge?.getWorkflow()?.then((res) => {
        workflowManager.handleWorkflow(res);
      });
    }
  }

  let isRestarting = $state(false);
  async function handleRestart() {
    isRestarting = true;
    try {
      await fetch('/comfygrid/api/restart', { method: 'POST' });
    } catch (e) {
      logger.error('Failed to restart ComfyUI', e);
    } finally {
      isRestarting = false;
    }
  }

  function handleReload() {
    if (comfyUiState.iframe) {
      comfyUiState.iframe.src = comfyUiState.iframe.src;
    }
  }
</script>

<li class="nav-item" class:dropdown={hasSubmenu} title={title ?? ''}>
  <button
    class="nav-link"
    class:active={isActive}
    class:has-submenu={hasSubmenu}
    role="tab {id}"
    aria-selected={isActive}
    onclick={changeActiveTab}
  >
    {text}
  </button>
  {#if hasSubmenu}
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button class="dropdown-toggle-btn" data-bs-toggle="dropdown" aria-expanded="false"></button>
    <ul class="dropdown-menu">
      <li>
        <button class="dropdown-item d-flex align-items-center gap-2" onclick={handleReload}>
          <i class="pi pi-refresh"></i>
          {$t('tab.comfyui.reload')}
        </button>
      </li>
      <li>
        <button
          class="dropdown-item d-flex align-items-center gap-2"
          onclick={handleRestart}
          disabled={isRestarting}
        >
          {#if isRestarting}
            <i class="pi pi-spin pi-spinner"></i>
          {:else}
            <i class="pi pi-power-off"></i>
          {/if}
          {$t('tab.comfyui.restart')}
        </button>
      </li>
    </ul>
  {/if}
</li>

<style lang="scss">
  .nav-item {
    position: relative;
    display: flex;
    align-items: center;
  }

  .nav-link.has-submenu {
    padding-right: 1.5rem;
  }

  .dropdown-toggle-btn {
    position: absolute;
    right: 0;
    top: 0;
    height: 100%;
    width: 1.5rem;
    border: none;
    background: none;
    padding: 0;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;

    &::after {
      display: inline-block;
      content: '';
      border-top: 0.3em solid;
      border-right: 0.3em solid transparent;
      border-left: 0.3em solid transparent;
      vertical-align: middle;
    }

    &:hover {
      opacity: 1;
    }
  }
</style>
