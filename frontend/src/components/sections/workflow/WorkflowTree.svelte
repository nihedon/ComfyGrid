<script lang="ts">
  import { ChevronDown, ChevronRight, Folder, FolderOpen, Star } from '@lucide/svelte';
  import { workflowState } from '@/states/workflow-state.svelte';
  import type { WorkflowItem } from '@/types/workflow';
  import WorkflowContextMenu from './WorkflowContextMenu.svelte';

  type FolderNode = {
    path: string;
    name: string;
    children: FolderNode[];
  };

  let dragOverFolder = $state<string | null>(null);
  let expandedFolders = $state<Set<string>>(new Set(['']));
  let contextMenu = $state<{
    item: WorkflowItem | null;
    targetFolder?: string;
    x: number;
    y: number;
  } | null>(null);

  const folderTree = $derived.by(() => {
    const root: FolderNode = { path: '', name: 'Workflow', children: [] };
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, FolderNode>();
    map.set('', root);

    for (const folder of workflowState.folders) {
      if (!folder) continue;
      const parts = folder.split('/');
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!map.has(currentPath)) {
          const node: FolderNode = { path: currentPath, name: part, children: [] };
          map.set(currentPath, node);
          const parentNode = map.get(parentPath);
          if (parentNode) {
            parentNode.children.push(node);
          }
        }
      }
    }
    return root;
  });

  function toggleFolder(folderPath: string, e?: Event) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (expandedFolders.has(folderPath)) {
      expandedFolders.delete(folderPath);
    } else {
      expandedFolders.add(folderPath);
    }
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    expandedFolders = new Set(expandedFolders);
  }

  function selectFolder(folderPath: string) {
    workflowState.isFavoriteView = false;
    workflowState.selectedFolder = folderPath;
    workflowState.selectedPath = folderPath;
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
      name: folderPath === '' ? 'Workflow' : (folderPath.split('/').pop() ?? ''),
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
  class="d-flex flex-column h-100 p-2 border-end overflow-auto"
  style="width: 250px; flex-shrink: 0;"
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
    {#snippet treeNode(node: FolderNode)}
      {@const isSelected =
        !workflowState.isFavoriteView && workflowState.selectedFolder === node.path}
      {@const isOver = dragOverFolder === node.path}
      {@const isRenaming =
        workflowState.renamingPath === node.path && workflowState.renamingPane === 'tree'}

      <li>
        <div
          class="d-flex align-items-center mt-1 text-nowrap rounded px-1"
          class:bg-primary-subtle={isOver}
          oncontextmenu={(e) => handleFolderContextMenu(e, node.path)}
          ondragover={(e) => handleDragOver(e, node.path)}
          ondragleave={() => (dragOverFolder = null)}
          ondrop={(e) => handleDrop(e, node.path)}
        >
          {#if node.children.length > 0}
            <!-- svelte-ignore a11y_invalid_attribute -->
            <a
              href="#"
              class="text-decoration-none me-1 text-secondary d-inline-flex align-items-center justify-content-center"
              style="width: 16px; text-align: center;"
              onclick={(e) => toggleFolder(node.path, e)}
            >
              {#if expandedFolders.has(node.path)}
                <ChevronDown size={14} />
              {:else}
                <ChevronRight size={14} />
              {/if}
            </a>
          {:else}
            <span style="width: 16px; margin-right: 0.25rem;"></span>
          {/if}

          {#if isRenaming}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type="text"
              class="form-control form-control-sm py-0 px-1 fs-6"
              autofocus
              bind:value={workflowState.renamingInput}
              onkeydown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') submitRename(node.path);
                if (e.key === 'Escape') workflowState.cancelRename();
              }}
              onblur={() => submitRename(node.path)}
              onclick={(e) => e.stopPropagation()}
            />
          {:else}
            <!-- svelte-ignore a11y_invalid_attribute -->
            <a
              href="#"
              class="text-decoration-none d-inline-flex align-items-center gap-1 flex-grow-1 overflow-hidden"
              class:fw-bold={isSelected}
              onclick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                selectFolder(node.path);
              }}
              title={node.path || 'Workflow'}
            >
              {#if expandedFolders.has(node.path)}
                <FolderOpen size={16} class="text-secondary flex-shrink-0" />
              {:else}
                <Folder size={16} class="text-secondary flex-shrink-0" />
              {/if}
              <span class="text-body text-truncate">{node.name}</span>
            </a>
          {/if}
        </div>

        {#if node.children.length > 0 && expandedFolders.has(node.path)}
          <ul class="list-unstyled ms-3 mb-0">
            {#each node.children as child (child.path)}
              {@render treeNode(child)}
            {/each}
          </ul>
        {/if}
      </li>
    {/snippet}

    <ul class="list-unstyled mb-0">
      {@render treeNode(folderTree)}
    </ul>
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
