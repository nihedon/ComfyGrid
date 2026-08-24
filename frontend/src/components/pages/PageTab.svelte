<script lang="ts">
  import { Workflow } from '@lucide/svelte';
  import { Check } from '@lucide/svelte';
  import { workflowManager } from '@/managers/workflow-manager';
  import { updateBoardFloatingState } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import type { WorkflowTabItem } from '@/states/comfyui-bridge.svelte';

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

  let workflowTabs = $state<WorkflowTabItem[]>([]);

  function refreshWorkflowTabs() {
    if (appState.bridge) {
      workflowTabs = appState.bridge.getWorkflowTabs();
    }
  }

  function changeActiveTab() {
    uiState.activePageId = id;
    if (id === 'comfyui') {
      uiState.needRefresh = true;
    } else if (id === 'grid') {
      if (uiState.needRefresh) {
        uiState.needRefresh = false;
        workflowManager.loadCurrentWorkflow();
      } else {
        updateBoardFloatingState();
      }
    }
  }

  function handleSelectTab(item: WorkflowTabItem) {
    item.tab.click();
    if (id !== 'grid' && id !== 'comfyui') {
      uiState.needRefresh = true;
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
    <button
      class="dropdown-toggle-btn"
      data-bs-toggle="dropdown"
      aria-expanded="false"
      onclick={refreshWorkflowTabs}
      onpointerenter={refreshWorkflowTabs}
    >
      <Workflow size={14} />
    </button>
    <ul class="dropdown-menu">
      {#each workflowTabs as item, index (`${item.label}-${index}`)}
        <li>
          <button
            class="dropdown-item d-flex align-items-center justify-content-between gap-2"
            class:active={item.selected}
            onclick={() => handleSelectTab(item)}
          >
            <span class="text-truncate">{item.label}</span>
            {#if item.selected}
              <Check size={14} />
            {/if}
          </button>
        </li>
      {/each}
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
    padding-right: 2rem;
  }

  .dropdown-toggle-btn {
    position: absolute;
    right: 0;
    top: 0;
    height: 100%;
    width: 2rem;
    border: none;
    background: none;
    padding: 0;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;

    &:hover {
      opacity: 1;
    }
  }
</style>
