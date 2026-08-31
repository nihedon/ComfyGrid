<script lang="ts">
  import { Folder, Star, Workflow } from '@lucide/svelte';
  import { workflowState } from '@/states/workflow-state.svelte';
  import type { WorkflowItem } from '@/types/workflow';
  import WorkflowContextMenu from './WorkflowContextMenu.svelte';

  let dragOverFolder = $state<string | null>(null);
  let contextMenu = $state<{ item: WorkflowItem | null; x: number; y: number } | null>(null);

  function handleDragStart(e: DragEvent, item: WorkflowItem) {
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', item.path);
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleFolderDragOver(e: DragEvent, folderPath: string) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragOverFolder = folderPath;
  }

  function handleFolderDrop(e: DragEvent, targetFolder: string) {
    e.preventDefault();
    dragOverFolder = null;
    const sourcePath = e.dataTransfer?.getData('text/plain');
    if (sourcePath && sourcePath !== targetFolder) {
      workflowState.move(sourcePath, targetFolder);
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

  function handleRowClick(e: MouseEvent, item: WorkflowItem) {
    e.stopPropagation();
    workflowState.selectedPath = item.path;
  }

  function handleRowDblClick(item: WorkflowItem) {
    if (workflowState.renamingPath === item.path) return;
    if (item.type === 'folder') {
      workflowState.selectedFolder = item.path;
      workflowState.isFavoriteView = false;
    } else {
      workflowState.loadWorkflowToComfyUI(item);
    }
  }

  function handleToggleFavorite(e: MouseEvent, item: WorkflowItem) {
    e.stopPropagation();
    workflowState.toggleFavorite(item);
  }

  function formatBytes(bytes?: number) {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  class="table-responsive h-100"
  onclick={() => (workflowState.selectedPath = null)}
  oncontextmenu={handleBackgroundContextMenu}
>
  <table class="table table-hover align-middle fs-6 mb-0">
    <thead class="table-light">
      <tr>
        <th style="width: 36px;"></th>
        <th style="width: 40px;"></th>
        <th>Name</th>
        <th style="width: 120px;">Nodes</th>
        <th style="width: 120px;">Size</th>
        <th style="width: 160px;">Modified</th>
      </tr>
    </thead>
    <tbody>
      {#each workflowState.currentFolderItems as item (item.path)}
        {@const isRenaming =
          workflowState.renamingPath === item.path && workflowState.renamingPane === 'main'}
        {@const isSelected = workflowState.selectedPath === item.path}
        {@const isFolder = item.type === 'folder'}
        {@const isOver = dragOverFolder === item.path}

        <tr
          class="cursor-pointer"
          class:table-active={isSelected}
          class:table-primary={isOver}
          draggable={!isRenaming}
          ondragstart={(e) => handleDragStart(e, item)}
          ondragover={(e) => isFolder && handleFolderDragOver(e, item.path)}
          ondragleave={() => isFolder && (dragOverFolder = null)}
          ondrop={(e) => isFolder && handleFolderDrop(e, item.path)}
          oncontextmenu={(e) => handleItemContextMenu(e, item)}
          onclick={(e) => handleRowClick(e, item)}
          ondblclick={() => handleRowDblClick(item)}
        >
          <td class="text-center p-0 ps-2">
            {#if !isFolder}
              <button
                class="btn btn-sm btn-link p-0 text-warning text-decoration-none"
                class:opacity-25={!item.is_favorite}
                class:opacity-100={item.is_favorite}
                onclick={(e) => handleToggleFavorite(e, item)}
                title={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star size={16} fill={item.is_favorite ? 'currentColor' : 'none'} />
              </button>
            {/if}
          </td>
          <td class="text-center">
            {#if isFolder}
              <Folder size={18} class="text-warning" />
            {:else}
              <Workflow size={18} class="text-primary" />
            {/if}
          </td>
          <td>
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
              <span class="fw-medium">
                {item.name}
              </span>
            {/if}
          </td>
          <td>{item.node_count !== undefined && !isFolder ? `${item.node_count} nodes` : '-'}</td>
          <td>{formatBytes(item.size)}</td>
          <td class="text-body-secondary">{new Date(item.modified).toLocaleString()}</td>
        </tr>
      {/each}
    </tbody>
  </table>
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
</style>
