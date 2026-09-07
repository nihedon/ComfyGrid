<script lang="ts">
  import { FolderPlus, PencilLine, Play, Star, Trash2 } from '@lucide/svelte';
  import { workflowState } from '@/states/workflow-state.svelte';
  import type { WorkflowItem } from '@/types/workflow';

  let {
    item,
    targetFolder,
    sourcePane = 'main',
    x,
    y,
    onClose,
  }: {
    item: WorkflowItem | null;
    targetFolder?: string;
    sourcePane?: 'tree' | 'main';
    x: number;
    y: number;
    onClose: () => void;
  } = $props();

  function handleLoad() {
    if (item) {
      workflowState.loadWorkflowToComfyUI(item);
    }
    onClose();
  }

  function handleToggleFavorite() {
    if (item) {
      workflowState.toggleFavorite(item);
    }
    onClose();
  }

  function handleStartRename() {
    if (item) {
      workflowState.startRename(item, sourcePane);
    }
    onClose();
  }

  async function handleCreateFolder() {
    const parent = item
      ? item.type === 'folder'
        ? item.path
        : item.parent
      : (targetFolder ?? workflowState.selectedFolder);
    const folderName = window.prompt('Enter new folder name:');
    if (folderName?.trim()) {
      await workflowState.createFolder(folderName.trim(), parent);
    }
    onClose();
  }

  async function handleDelete() {
    if (item) {
      if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
        await workflowState.delete(item.path);
      }
    }
    onClose();
  }
</script>

<!-- Backdrop to capture clicks outside the menu -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="position-fixed top-0 start-0 w-100 h-100"
  style="z-index: 1050;"
  onclick={onClose}
  oncontextmenu={(e) => {
    e.preventDefault();
    onClose();
  }}
></div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="dropdown-menu show position-fixed shadow py-1"
  style:left={`${x}px`}
  style:top={`${y}px`}
  style="z-index: 1051; min-width: 170px;"
  onclick={(e) => e.stopPropagation()}
  oncontextmenu={(e) => e.stopPropagation()}
>
  {#if item}
    {#if item.type === 'file'}
      <button class="dropdown-item d-flex align-items-center gap-2 py-1 fs-6" onclick={handleLoad}>
        <Play size={14} />
        <span>Load to Canvas</span>
      </button>
      <button
        class="dropdown-item d-flex align-items-center gap-2 py-1 fs-6"
        onclick={handleToggleFavorite}
      >
        <Star
          size={14}
          class={item.is_favorite ? 'text-warning' : ''}
          fill={item.is_favorite ? 'currentColor' : 'none'}
        />
        <span>{item.is_favorite ? 'Remove Favorite' : 'Add to Favorites'}</span>
      </button>
    {:else}
      <button
        class="dropdown-item d-flex align-items-center gap-2 py-1 fs-6"
        onclick={handleCreateFolder}
      >
        <FolderPlus size={14} />
        <span>New Folder</span>
      </button>
    {/if}

    {#if item.path !== ''}
      <div class="dropdown-divider my-1"></div>
      <button
        class="dropdown-item d-flex align-items-center gap-2 py-1 fs-6"
        onclick={handleStartRename}
      >
        <PencilLine size={14} />
        <span>Rename</span>
      </button>
      <div class="dropdown-divider my-1"></div>
      <button
        class="dropdown-item d-flex align-items-center gap-2 py-1 fs-6 text-danger"
        onclick={handleDelete}
      >
        <Trash2 size={14} />
        <span>Delete</span>
      </button>
    {/if}
  {:else}
    <button
      class="dropdown-item d-flex align-items-center gap-2 py-1 fs-6"
      onclick={handleCreateFolder}
    >
      <FolderPlus size={14} />
      <span>New Folder</span>
    </button>
  {/if}
</div>
