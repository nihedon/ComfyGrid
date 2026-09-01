<script lang="ts">
  import { Heart, Workflow } from '@lucide/svelte';
  import { workflowState } from '@/states/workflow-state.svelte';
  import type { WorkflowItem } from '@/types/workflow';
  import WorkflowContextMenu from './WorkflowContextMenu.svelte';

  let contextMenu = $state<{ item: WorkflowItem | null; x: number; y: number } | null>(null);

  function handleDragStart(e: DragEvent, item: WorkflowItem) {
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', item.path);
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleItemContextMenu(e: MouseEvent, item: WorkflowItem) {
    e.preventDefault();
    e.stopPropagation();
    workflowState.selectedPath = item.path;
    contextMenu = { item, x: e.clientX, y: e.clientY };
  }

  function handleBackgroundContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu = { item: null, x: e.clientX, y: e.clientY };
  }

  function startRename(item: WorkflowItem) {
    workflowState.startRename(item, 'main');
  }

  function submitRename(item: WorkflowItem) {
    workflowState.rename(item.path, workflowState.renamingInput);
  }

  function handleCardClick(e: MouseEvent, item: WorkflowItem) {
    e.stopPropagation();
    workflowState.selectedPath = item.path;
  }

  function handleCardDblClick(item: WorkflowItem) {
    if (workflowState.renamingPath === item.path) return;
    workflowState.loadWorkflowToComfyUI(item);
  }

  function handleToggleFavorite(e: MouseEvent, item: WorkflowItem) {
    e.stopPropagation();
    workflowState.toggleFavorite(item);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'F2' && workflowState.selectedPath) {
      const item = workflowState.currentFolderItems.find(
        (i) => i.path === workflowState.selectedPath,
      );
      if (item) {
        e.preventDefault();
        startRename(item);
      }
    }
  }}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="h-100 p-3"
  onclick={() => (workflowState.selectedPath = null)}
  oncontextmenu={handleBackgroundContextMenu}
>
  <div class="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 row-cols-xl-5 g-3">
    {#each workflowState.currentFolderItems as item (item.path)}
      {@const isRenaming =
        workflowState.renamingPath === item.path && workflowState.renamingPane === 'main'}
      {@const isSelected = workflowState.selectedPath === item.path}

      <div class="col">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="card h-100 shadow-sm workflow-card cursor-pointer border position-relative"
          class:selected={isSelected}
          draggable={!isRenaming}
          ondragstart={(e) => handleDragStart(e, item)}
          oncontextmenu={(e) => handleItemContextMenu(e, item)}
          onclick={(e) => handleCardClick(e, item)}
          ondblclick={() => handleCardDblClick(item)}
        >
          <!-- Favorite button -->
          <button
            class="btn btn-sm btn-icon position-absolute top-0 end-0 m-1 z-2 border-0 bg-transparent text-danger p-1"
            class:opacity-25={!item.is_favorite}
            class:opacity-100={item.is_favorite}
            onclick={(e) => handleToggleFavorite(e, item)}
            title={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart size={18} fill={item.is_favorite ? 'currentColor' : 'none'} />
          </button>

          <div
            class="card-img-top bg-body-tertiary d-flex align-items-center justify-content-center overflow-hidden position-relative"
            style="height: 160px;"
          >
            {#if item.has_thumbnail}
              <img
                src={`/comfygrid/api/workflows/thumbnail?path=${encodeURIComponent(item.path)}&t=${workflowState.thumbnailTimestamp}`}
                alt={item.name}
                class="w-100 h-100 object-fit-contain"
              />
            {:else}
              <Workflow size={40} class="text-body-secondary opacity-50" />
            {/if}

            {#if item.node_count !== undefined}
              <span class="badge text-bg-dark position-absolute bottom-0 end-0 m-2 opacity-75 fs-7">
                {item.node_count} nodes
              </span>
            {/if}
          </div>

          <div class="card-body p-2 d-flex flex-column justify-content-between">
            {#if isRenaming}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                type="text"
                class="form-control form-control-sm"
                autofocus
                bind:value={workflowState.renamingInput}
                onkeydown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') submitRename(item);
                  if (e.key === 'Escape') workflowState.cancelRename();
                }}
                onblur={() => submitRename(item)}
                onclick={(e) => e.stopPropagation()}
                ondblclick={(e) => e.stopPropagation()}
              />
            {:else}
              <span class="card-title fw-semibold text-truncate mb-1 fs-6" title={item.name}>
                {item.name}
              </span>
            {/if}

            <div
              class="d-flex justify-content-between align-items-center text-body-secondary fs-7 mt-1"
            >
              <span>{new Date(item.modified).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

{#if contextMenu}
  <WorkflowContextMenu
    item={contextMenu.item}
    sourcePane="main"
    x={contextMenu.x}
    y={contextMenu.y}
    onClose={() => (contextMenu = null)}
  />
{/if}

<style>
  .cursor-pointer {
    cursor: pointer;
    user-select: none;
  }
  .workflow-card {
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
    &.selected {
      box-shadow: 0 0 0 3px var(--bs-primary) !important;
    }
  }
  .workflow-card:hover {
    transform: translateY(-2px);
  }
  .workflow-card:hover .btn-icon {
    opacity: 1 !important;
  }
</style>
