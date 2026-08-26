<script lang="ts">
  import { Check, Workflow } from '@lucide/svelte';
  import { appState } from '@/states/app-state.svelte';
  import type { WorkflowTabItem } from '@/states/comfyui-bridge.svelte';

  const uiState = appState.uiState;

  let workflowTabs = $state<WorkflowTabItem[]>([]);

  function refreshWorkflowTabs() {
    if (appState.bridge) {
      workflowTabs = appState.bridge.getWorkflowTabs();
    }
  }

  function handleSelectTab(item: WorkflowTabItem) {
    item.tab.click();
    if (uiState.activePageId !== 'grid' && uiState.activePageId !== 'comfyui') {
      uiState.needRefresh = true;
    }
  }
</script>

<div class="dropdown">
  <button
    class="dropdown-toggle btn btn-outline-secondary d-flex justify-content-center align-items-center p-1"
    type="button"
    data-bs-toggle="dropdown"
    aria-expanded="false"
    style="width: 2.2rem; height: 2.2rem;"
    onclick={refreshWorkflowTabs}
    onpointerenter={refreshWorkflowTabs}
    ><Workflow size={18} />
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
</div>

<style lang="scss">
  .dropdown-toggle::after {
    display: none;
  }
</style>
