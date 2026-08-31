<script lang="ts">
  import { ChevronDown, ChevronRight, Folder, Star } from '@lucide/svelte';
  import { workflowState } from '@/states/workflow-state.svelte';
  import type { WorkflowItem } from '@/types/workflow';
  import WorkflowContextMenu from './WorkflowContextMenu.svelte';

  let dragOverFolder = $state<string | null>(null);
  let expandedFolders = $state<Set<string>>(new Set(['']));
  let contextMenu = $state<{
    item: WorkflowItem | null;
    targetFolder?: string;
    x: number;
    y: number;
  } | null>(null);

  function toggleFolder(folderPath: string) {
    if (expandedFolders.has(folderPath)) {
      expandedFolders.delete(folderPath);
    } else {
      expandedFolders.add(folderPath);
    }
  }

  function handleDrop(e: DragEvent, targetFolder: string) {
    e.preventDefault();
    dragOverFolder = null;
    const sourcePath = e.dataTransfer?.getData('text/plain');
    if (sourcePath && sourcePath !== targetFolder) {
      workflowState.move(sourcePath, targetFolder);
    }
  }

  function handleDragOver(e: DragEvent, folderPath: string) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragOverFolder = folderPath;
  }

  function handleFolderContextMenu(e: MouseEvent, folderPath: string) {
    e.preventDefault();
    e.stopPropagation();
    workflowState.selectedPath = folderPath;
    const item = workflowState.items.find((i) => i.path === folderPath) ?? {
      type: 'folder' as const,
      name: folderPath === '' ? 'All Workflows' : (folderPath.split('/').pop() ?? ''),
      path: folderPath,
      parent: folderPath.includes('/') ? folderPath.substring(0, folderPath.lastIndexOf('/')) : '',
      modified: Date.now(),
    };
    contextMenu = { item, targetFolder: folderPath, x: e.clientX, y: e.clientY };
  }

  function handleTreeBackgroundContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu = { item: null, targetFolder: '', x: e.clientX, y: e.clientY };
  }

  function submitRename(folderPath: string) {
    workflowState.rename(folderPath, workflowState.renamingInput);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="d-flex flex-column h-100 p-2 border-end"
  style="width: 260px; min-width: 260px;"
  onclick={() => (workflowState.selectedPath = null)}
  oncontextmenu={handleTreeBackgroundContextMenu}
>
  <!-- Favorites Filter Item -->
  <div class="mb-2 pb-2 border-bottom">
    <div
      class="list-group-item list-group-item-action d-flex align-items-center py-1 px-2 border-0 rounded cursor-pointer"
      class:active={workflowState.isFavoriteView}
      onclick={(e) => {
        e.stopPropagation();
        workflowState.isFavoriteView = true;
        workflowState.selectedPath = null;
      }}
    >
      <Star size={16} class="me-2 text-warning flex-shrink-0" fill="currentColor" />
      <span class="text-truncate flex-grow-1 fs-6">Favorites</span>
      {#if workflowState.favoriteCount > 0}
        <span class="badge rounded-pill text-bg-secondary fs-8">
          {workflowState.favoriteCount}
        </span>
      {/if}
    </div>
  </div>

  <div class="flex-grow-1 overflow-y-auto">
    <div class="list-group list-group-flush">
      {#each workflowState.folders as folderPath (folderPath)}
        {@const isRoot = folderPath === ''}
        {@const depth = isRoot ? 0 : folderPath.split('/').length}
        {@const name = isRoot ? 'All Workflows' : folderPath.split('/').pop()}
        {@const isSelected = !workflowState.isFavoriteView && workflowState.selectedFolder === folderPath}
        {@const isOver = dragOverFolder === folderPath}
        {@const isRenaming = workflowState.renamingPath === folderPath && workflowState.renamingPane === 'tree'}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="list-group-item list-group-item-action d-flex align-items-center py-1 px-2 border-0 rounded cursor-pointer"
          class:active={isSelected}
          class:bg-primary-subtle={isOver}
          style:padding-left={`${depth * 14 + 8}px`}
          onclick={(e) => {
            e.stopPropagation();
            workflowState.isFavoriteView = false;
            workflowState.selectedFolder = folderPath;
            workflowState.selectedPath = folderPath;
          }}
          oncontextmenu={(e) => handleFolderContextMenu(e, folderPath)}
          ondragover={(e) => handleDragOver(e, folderPath)}
          ondragleave={() => (dragOverFolder = null)}
          ondrop={(e) => handleDrop(e, folderPath)}
        >
          <button
            class="btn btn-link btn-xs p-0 me-1 text-decoration-none text-reset"
            onclick={(e) => {
              e.stopPropagation();
              toggleFolder(folderPath);
            }}
          >
            {#if expandedFolders.has(folderPath)}
              <ChevronDown size={14} />
            {:else}
              <ChevronRight size={14} />
            {/if}
          </button>
          <Folder size={14} class="me-2 text-warning flex-shrink-0" />

          {#if isRenaming}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type="text"
              class="form-control form-control-sm py-0 px-1 fs-6"
              autofocus
              bind:value={workflowState.renamingInput}
              onkeydown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') submitRename(folderPath);
                if (e.key === 'Escape') workflowState.cancelRename();
              }}
              onblur={() => submitRename(folderPath)}
              onclick={(e) => e.stopPropagation()}
            />
          {:else}
            <span class="text-truncate flex-grow-1 fs-6">{name}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

{#if contextMenu}
  <WorkflowContextMenu
    item={contextMenu.item}
    targetFolder={contextMenu.targetFolder}
    sourcePane="tree"
    x={contextMenu.x}
    y={contextMenu.y}
    onClose={() => (contextMenu = null)}
  />
{/if}

<style>
  .cursor-pointer {
    cursor: pointer;
  }
  .fs-8 {
    font-size: 0.75rem;
  }
</style>
