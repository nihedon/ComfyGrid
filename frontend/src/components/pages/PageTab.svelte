<script lang="ts">
  import { workflowManager } from '@/managers/workflow-manager';
  import { updateBoardFloatingState } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';

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
</script>

<li class="nav-item" title={title ?? ''}>
  <button
    class="nav-link"
    class:active={isActive}
    role="tab {id}"
    aria-selected={isActive}
    onclick={changeActiveTab}
  >
    {text}
  </button>
</li>

<style lang="scss">
  .nav-item {
    position: relative;
    display: flex;
    align-items: center;
  }
</style>
