<script lang="ts">
  import { FolderPlus, PencilLine, Play, Star, Trash2 } from '@lucide/svelte';
  import { ContextMenu } from 'bits-ui';
  import MenuItems from '@/components/common/MenuItems.svelte';
  import { workflowState } from '@/states/workflow-state.svelte';
  import type { MenuEntry } from '@/types/menu';
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

  const anchor = $derived.by(() => {
    const left = x,
      top = y;
    return { getBoundingClientRect: () => new DOMRect(left, top, 0, 0) };
  });
  const items = $derived.by((): MenuEntry[] => {
    const items: MenuEntry[] = [];
    if (item?.type === 'file') {
      items.push({
        id: 'load',
        kind: 'action',
        label: 'Load to Canvas',
        icon: Play,
        onSelect: handleLoad,
      });
      items.push({
        id: 'favorite',
        kind: 'action',
        label: item.is_favorite ? 'Remove Favorite' : 'Add to Favorites',
        icon: Star,
        onSelect: handleToggleFavorite,
      });
    } else
      items.push({
        id: 'folder',
        kind: 'action',
        label: 'New Folder',
        icon: FolderPlus,
        onSelect: handleCreateFolder,
      });
    if (item && item.path !== '')
      items.push(
        { id: 'rename-separator', kind: 'separator' },
        {
          id: 'rename',
          kind: 'action',
          label: 'Rename',
          icon: PencilLine,
          onSelect: handleStartRename,
        },
        { id: 'delete-separator', kind: 'separator' },
        {
          id: 'delete',
          kind: 'action',
          label: 'Delete',
          icon: Trash2,
          danger: true,
          onSelect: handleDelete,
        },
      );
    return items;
  });
</script>

<ContextMenu.Root
  open={true}
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <ContextMenu.Portal>
    <ContextMenu.Content
      class="dropdown-menu show cg-menu"
      customAnchor={anchor}
      side="bottom"
      align="start"
      collisionPadding={8}
      preventScroll={false}
    >
      <MenuItems {items} context />
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
