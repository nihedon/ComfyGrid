<script lang="ts">
  import { untrack } from 'svelte';
  import {
    ArrowDownAZ,
    ArrowDownWideNarrow,
    ArrowUpNarrowWide,
    CalendarClock,
    CalendarPlus,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Folder,
    FolderOpen,
    Heart,
    RotateCw,
    Search,
    Star,
    Trash2,
  } from '@lucide/svelte';
  import { sortBy } from 'es-toolkit/array';
  import { comfyGridApiClient } from '@/api/api-client';
  import { t } from '@/i18n/i18n';
  import { workflowManager } from '@/managers/workflow-manager';
  import { refreshModels } from '@/services/models-service';
  import { saveOptsWithCallback } from '@/services/options-service';
  import { appState } from '@/states/app-state.svelte';
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';
  import logger from '@/utils/logger';
  import { SearchIndexer } from '@/utils/search-indexer';
  import ModelInfoWrapper from './ModelInfoWrapper.svelte';
  import Thumbnail from './Thumbnail.svelte';

  type ModelSortType = 'path' | 'name' | 'modified' | 'created' | 'rate';

  type SortType = 'path' | 'name' | 'modified' | 'created' | 'rate';

  let {
    dir,
    subdirs,
    valueSet,
    action = null,
    focusSelectedModel = false,
  }: {
    dir: ModelTypes;
    subdirs: ReadonlyArray<string>;
    valueSet?: ReadonlySet<string>;
    action?: ((model: Model) => void) | null;
    focusSelectedModel?: boolean;
  } = $props();

  const modalState = appState.modalState;
  const optionState = appState.optionState;
  const storageState = appState.storageState;

  const modelThumbWidth = $derived(optionState.get('ComfyGrid.ui.model_thumbnail_width'));

  const folderStorageKey = $derived.by(() => {
    const sortedSubdirs = [...(subdirs ?? [])].sort().join('.');
    return sortedSubdirs
      ? `ComfyGrid.ui.model_selected_folder.${dir}.${sortedSubdirs}`
      : `ComfyGrid.ui.model_selected_folder.${dir}`;
  });

  const modelList = $derived.by(() => {
    let values: Model[] = [];
    if (dir === 'models') {
      values = Array.from(storageState.models.values());
      values = values.filter((model: Model) => subdirs.some((subdir) => model.category === subdir));
      if (valueSet) {
        values = values.filter((model: Model) => valueSet.has(model.path));
      }
    } else if (dir === 'images') {
      values = Array.from(storageState.images.values());
    } else if (dir === 'videos') {
      values = Array.from(storageState.videos.values());
    }
    return values;
  });

  let filterText = $state('');
  let selectedFolder = $state<string>(untrack(() => optionState.get(folderStorageKey) ?? ''));
  let showNsfw = $state(optionState.get('ComfyGrid.ui.show_nsfw'));
  let favoriteOnly = $state(false);

  const sortAsc = $derived<boolean>(optionState.get(`ComfyGrid.ui.${dir}_sort_asc`) ?? true);
  const sortMethod = $derived<SortType>(optionState.get(`ComfyGrid.ui.${dir}_sort`) ?? 'path');

  const folderList = $derived.by(() => {
    const folders: string[] = [];
    for (const model of modelList) {
      const pathParts = model.path.split(/[/\\]/);
      if (pathParts.length > 1) {
        pathParts.pop();
        const folder = pathParts.join('/');
        if (!folders.includes(folder)) {
          folders.push(folder);
        }
      }
    }
    return folders.sort();
  });

  type FolderNode = {
    path: string;
    name: string;
    children: FolderNode[];
  };

  let expandedFolders = $state<Set<string>>(new Set(['']));

  function toggleFolder(path: string, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (expandedFolders.has(path)) {
      expandedFolders.delete(path);
    } else {
      expandedFolders.add(path);
    }
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    expandedFolders = new Set(expandedFolders);
  }

  const folderTree = $derived.by(() => {
    const root: FolderNode = { path: '', name: 'All Folders', children: [] };
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, FolderNode>();
    map.set('', root);

    for (const folder of folderList) {
      const parts = folder.split('/');
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!map.has(currentPath)) {
          const node: FolderNode = { path: currentPath, name: part, children: [] };
          map.set(currentPath, node);
          map.get(parentPath)!.children.push(node);
        }
      }
    }
    return root;
  });

  const sortedModelList = $derived.by(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortParams: any[] =
      sortMethod === 'rate' ? [(m: Model) => m.rate ?? 0, 'path'] : [sortMethod];
    const sortedList = sortBy(modelList, sortParams);
    return sortAsc ? sortedList : sortedList.reverse();
  });

  let modelIndexer: SearchIndexer<Model> | null = null;

  $effect(() => {
    if (!modelIndexer) {
      modelIndexer = new SearchIndexer(modelList, (m) => m.path ?? '');
    } else {
      modelIndexer.update(modelList, (m) => m.path ?? '');
    }
  });

  const folderFilteredModelList = $derived.by(() => {
    if (!selectedFolder) {
      return sortedModelList;
    }
    return sortedModelList.filter((model: Model) => {
      const normalizedPath = (model.path ?? '').replace(/\\/g, '/');
      return normalizedPath.startsWith(selectedFolder + '/');
    });
  });

  const filteredModelList = $derived.by(() => {
    let list = folderFilteredModelList;
    if (!showNsfw) {
      list = list.filter((model: Model) => !model.nsfw);
    }
    if (favoriteOnly) {
      list = list.filter((model: Model) => model.favorite === true);
    }

    if (!filterText.trim() || !modelIndexer) {
      return list;
    }

    const searchSet = new Set(modelIndexer.search(filterText));
    return list.filter((model: Model) => searchSet.has(model));
  });

  const PAGE_SIZE = 100;
  let currentPage = $state(0);
  let listContainer = $state<HTMLElement>();

  function scrollToTop() {
    if (listContainer) {
      listContainer.scrollTop = 0;
    }
  }

  function goToPage(page: number) {
    currentPage = Math.max(0, Math.min(page, totalPages - 1));
    scrollToTop();
  }

  $effect(() => {
    void filterText;
    void selectedFolder;
    void sortMethod;
    void sortAsc;
    void showNsfw;
    void favoriteOnly;
    currentPage = 0;
    scrollToTop();
  });

  $effect(() => {
    optionState.set('ComfyGrid.ui.show_nsfw', showNsfw);
  });

  function expandParentFolders(folder: string) {
    if (!folder) return;
    const parts = folder.split('/');
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      expandedFolders.add(currentPath);
    }
    expandedFolders = new Set(expandedFolders);
  }

  function selectFolder(folder: string) {
    selectedFolder = folder;
    optionState.set(folderStorageKey, folder);
    saveOptsWithCallback();
    expandParentFolders(folder);
  }

  $effect(() => {
    const key = folderStorageKey;
    const storedFolder = optionState.get(key) ?? '';
    untrack(() => {
      selectedFolder = storedFolder;
      expandParentFolders(storedFolder);
    });
  });

  let hasInitializedFocus = false;
  $effect(() => {
    // Jump to the page containing the selected model ONLY once on initial modal open
    if (!focusSelectedModel || !modalState.selectedModelPath || hasInitializedFocus) return;
    const index = filteredModelList.findIndex((m) => m.path === modalState.selectedModelPath);
    if (index >= 0) {
      currentPage = Math.floor(index / PAGE_SIZE);
      hasInitializedFocus = true;
    }
  });

  const totalPages = $derived(Math.ceil(filteredModelList.length / PAGE_SIZE));
  const pagedModelList = $derived(
    filteredModelList.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
  );

  const visiblePageNumbers = $derived.by(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(0, currentPage - 2);
    let end = Math.min(totalPages - 1, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(0, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });

  function toggleSortOrder() {
    optionState.set(`ComfyGrid.ui.${dir}_sort_asc`, !sortAsc);
    saveOptsWithCallback();
    goToPage(0);
  }

  function changeSortType(value: SortType) {
    optionState.set(`ComfyGrid.ui.${dir}_sort`, value);
    saveOptsWithCallback();
    goToPage(0);
  }

  let isReloading = $state(false);

  async function reloadModels() {
    isReloading = true;
    const app = appState.comfyUiState.app;
    appState.toastState.addToast({ type: 'info', message: $t('toast.update_requested') });
    app?.refreshComboInNodes().then(async () => {
      await workflowManager.loadCurrentWorkflow();
      await refreshModels(dir);
      appState.toastState.addToast({
        type: 'success',
        message: $t('toast.update_request_completed'),
      });
      isReloading = false;
    });
  }

  function apply(model: Model) {
    if (action) {
      action(model);
    }
    if (modalState.handleSelect) {
      modalState.handleSelect(model);
      modalState.clearCallback();
      modalState.clearModelDir();
    }
  }

  async function deleteImage(e: Event, model: Model) {
    e.stopPropagation();
    if (!confirm($t('alert_delete_image'))) {
      return;
    }
    const path = model.path;
    const pathes = path.split(/[/\\]/);
    const filename = pathes[pathes.length - 1];
    pathes.pop();
    const subfolder = pathes.join('/');

    try {
      const res = await comfyGridApiClient.deleteImage({
        type: 'input',
        filename: filename,
        subfolder: subfolder,
      });
      if (res.ok) {
        storageState.deleteFor(dir, model.full_path);
      } else {
        logger.error('Failed to delete');
      }
    } catch (e) {
      logger.error(e);
    }
  }

  async function toggleFavorite(e: MouseEvent, model: Model) {
    e.preventDefault();
    e.stopPropagation();
    const nextState = !model.favorite;
    model.favorite = nextState;
    try {
      await comfyGridApiClient.postModelInfo(model.full_path, { favorite: nextState });
    } catch (err) {
      logger.error('Failed to toggle model favorite:', err);
    }
  }
</script>

<nav class="navbar navbar-light bg-light">
  <div class="container-fluid justify-content-end">
    <ul class="navbar-nav d-flex flex-row gap-2 align-items-center">
      {#if dir === 'models'}
        <li class="nav-item">
          <input
            class="btn-check"
            type="checkbox"
            id="favoriteOnlySwitch"
            bind:checked={favoriteOnly}
          />
          <label
            class="btn btn-sm btn-outline-primary py-0"
            for="favoriteOnlySwitch"
            style="width: 70px;">Favorite</label
          >
        </li>
        <li class="nav-item">
          <input class="btn-check" type="checkbox" id="showNsfwSwitch" bind:checked={showNsfw} />
          <label
            class="btn btn-sm btn-outline-primary py-0"
            for="showNsfwSwitch"
            style="width: 70px;"
          >
            {showNsfw ? 'ALL' : 'NSFW'}
          </label>
        </li>
      {/if}
      <li class="nav-item" style="width: 220px;">
        <div class="input-group input-group-sm">
          <span class="input-group-text">
            <Search size={14} class="text-body-secondary" />
          </span>
          <input
            type="search"
            class="form-control"
            name="filter"
            bind:value={filterText}
            placeholder="Filter {dir}..."
          />
        </div>
      </li>
      <li class="nav-item">
        <div class="btn-group" role="group">
          {#snippet sortButton(type: ModelSortType, iconName: string)}
            <button
              type="button"
              class="btn btn-sm btn-outline-primary btn-icon"
              name="{dir}_sort-method"
              value={type}
              onclick={() => changeSortType(type)}
              class:active={sortMethod === type}
            >
              {#if iconName === 'folder'}<Folder size={16} />{/if}
              {#if iconName === 'alpha'}<ArrowDownAZ size={16} />{/if}
              {#if iconName === 'clock'}<CalendarClock size={16} />{/if}
              {#if iconName === 'plus'}<CalendarPlus size={16} />{/if}
              {#if iconName === 'star'}<Star size={16} />{/if}
            </button>
          {/snippet}
          {@render sortButton('path', 'folder')}
          {@render sortButton('name', 'alpha')}
          {@render sortButton('modified', 'clock')}
          {@render sortButton('created', 'plus')}
          {@render sortButton('rate', 'star')}
        </div>
      </li>
      <li class="nav-item">
        <button
          type="button"
          class="btn btn-sm btn-outline-primary btn-icon"
          aria-label="Sort order"
          onclick={toggleSortOrder}
        >
          {#if sortAsc}
            <ArrowUpNarrowWide size={16} />
          {:else}
            <ArrowDownWideNarrow size={16} />
          {/if}
        </button>
      </li>
      <li class="nav-item">
        <button
          type="button"
          class="btn btn-sm btn-primary btn-icon"
          aria-label="Reload models"
          disabled={isReloading}
          onclick={reloadModels}><RotateCw size={16} class={isReloading ? 'spin' : ''} /></button
        >
      </li>
    </ul>
  </div>
</nav>

<div class="d-flex" style="flex: 1; min-height: 0;">
  <div class="border-end p-2 overflow-auto" style="width: 250px; flex-shrink: 0;">
    {#snippet treeNode(node: FolderNode)}
      <li>
        <div class="d-flex align-items-center mt-1 text-nowrap">
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

          <!-- svelte-ignore a11y_invalid_attribute -->
          <a
            href="#"
            class="text-decoration-none d-inline-flex align-items-center gap-1"
            class:fw-bold={selectedFolder === node.path}
            onclick={(e) => {
              e.preventDefault();
              selectFolder(node.path);
            }}
            title={node.path || 'All Folders'}
          >
            {#if expandedFolders.has(node.path)}
              <FolderOpen size={16} class="text-secondary" />
            {:else}
              <Folder size={16} class="text-secondary" />
            {/if}
            <span class="text-body">{node.name}</span>
          </a>
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

  <div class="flex-grow-1 overflow-hidden d-flex flex-column">
    <div
      class="d-flex flex-wrap align-content-start p-2 gap-2 overflow-auto h-100"
      bind:this={listContainer}
    >
      {#each pagedModelList as model (model.full_path + '?' + modelThumbWidth)}
        <div
          class="card rounded-2 position-relative overflow-hidden shadow-sm"
          class:selected={modalState.selectedModelPath === model.path}
          style:--modelThumbWidth="{modelThumbWidth}px;"
          data-name={model.name}
        >
          <div class="card-body p-0 w-100 h-100 position-relative">
            {#if dir === 'models'}
              <button
                class="btn btn-sm btn-icon position-absolute top-0 end-0 m-1 z-2 border-0 bg-transparent text-danger p-1"
                class:opacity-25={!model.favorite}
                class:opacity-100={model.favorite}
                onclick={(e) => toggleFavorite(e, model)}
                title={model.favorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Heart size={18} fill={model.favorite ? 'currentColor' : 'none'} />
              </button>
            {/if}

            <!-- svelte-ignore a11y_invalid_attribute -->
            <a
              class="text-decoration-none w-100 h-100"
              href="#"
              onclick={(e) => {
                e.preventDefault();
                apply(model);
              }}
            >
              {#if dir === 'images' || dir === 'videos'}
                <button
                  class="btn btn-danger position-absolute top-0 end-0 p-1 modelList-1 d-flex justify-content-center align-items-center fs-6 z-1"
                  aria-label="Delete image"
                  onclick={(e) => deleteImage(e, model)}
                >
                  <Trash2 size={16} />
                </button>
              {/if}
              <ModelInfoWrapper {model} {subdirs}>
                <Thumbnail {model} type={dir} />
              </ModelInfoWrapper>
            </a>
          </div>
        </div>
      {/each}
    </div>
    {#if totalPages > 1}
      <nav aria-label="Model list pagination">
        <ul class="pagination pagination-sm justify-content-center align-items-center mb-0 py-2">
          <li class="page-item" class:disabled={currentPage === 0}>
            <button class="page-link" onclick={() => goToPage(0)} aria-label="First">
              <ChevronsLeft size={16} />
            </button>
          </li>
          <li class="page-item" class:disabled={currentPage === 0}>
            <button
              class="page-link"
              onclick={() => goToPage(currentPage - 1)}
              aria-label="Previous"
            >
              <ChevronLeft size={16} />
            </button>
          </li>

          {#if visiblePageNumbers[0] > 0}
            <li class="page-item">
              <button class="page-link" onclick={() => goToPage(0)}>1</button>
            </li>
            {#if visiblePageNumbers[0] > 1}
              <li class="page-item disabled"><span class="page-link">...</span></li>
            {/if}
          {/if}

          {#each visiblePageNumbers as pageNum (pageNum)}
            <li class="page-item" class:active={pageNum === currentPage}>
              <button class="page-link" onclick={() => goToPage(pageNum)}>{pageNum + 1}</button>
            </li>
          {/each}

          {#if visiblePageNumbers.at(-1)! < totalPages - 1}
            {#if visiblePageNumbers.at(-1)! < totalPages - 2}
              <li class="page-item disabled"><span class="page-link">...</span></li>
            {/if}
            <li class="page-item">
              <button class="page-link" onclick={() => goToPage(totalPages - 1)}
                >{totalPages}</button
              >
            </li>
          {/if}

          <li class="page-item" class:disabled={currentPage >= totalPages - 1}>
            <button class="page-link" onclick={() => goToPage(currentPage + 1)} aria-label="Next">
              <ChevronRight size={16} />
            </button>
          </li>
          <li class="page-item" class:disabled={currentPage >= totalPages - 1}>
            <button class="page-link" onclick={() => goToPage(totalPages - 1)} aria-label="Last">
              <ChevronsRight size={16} />
            </button>
          </li>
          <li class="page-item disabled ms-2">
            <span class="page-link text-muted border-0 bg-transparent"
              >({filteredModelList.length})</span
            >
          </li>
        </ul>
      </nav>
    {/if}
  </div>
</div>

<style lang="scss">
  .card {
    width: var(--modelThumbWidth);
    height: calc((var(--modelThumbWidth) * 4) / 3);
    transition: all 0.2s ease-in-out;

    &:hover .opacity-25 {
      opacity: 0.75 !important;
    }

    &.selected {
      border: 3px solid var(--bs-primary);
      box-shadow: 0 0 20px rgba(var(--bs-primary-rgb), 0.5);
      transform: scale(1.02);
    }
  }
</style>
