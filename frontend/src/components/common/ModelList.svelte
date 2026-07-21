<script lang="ts">
  import { sortBy } from 'es-toolkit/array';
  import { comfyGridApiClient } from '@/api/api-client';
  import { t } from '@/i18n/i18n';
  import { refreshModels } from '@/services/models-service';
  import { saveOptsWithCallback } from '@/services/options-service';
  import { appState } from '@/states/app-state.svelte';
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';
  import logger from '@/utils/logger';
  import ModelInfoWrapper from './ModelInfoWrapper.svelte';
  import Thumbnail from './Thumbnail.svelte';

  type SortType = 'path' | 'name' | 'modified' | 'created' | 'rate';

  let {
    dir,
    subdirs,
    valueSet,
    action,
    focusSelectedModel = false,
  }: {
    dir: ModelTypes;
    subdirs: ReadonlyArray<string>;
    valueSet?: ReadonlySet<string>;
    action: ((model: Model) => void) | null;
    focusSelectedModel?: boolean;
  } = $props();

  const modalState = appState.modalState;
  const optionState = appState.optionState;
  const storageState = appState.storageState;

  const modelThumbWidth = $derived(
    optionState.opts.get('model_thumbnail_width') ??
      optionState.forms.get('model_thumbnail_width')?.default,
  );

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
  let selectedFolder = $state('');
  let showNsfw = $state(
    optionState.opts.get('show_nsfw') ?? optionState.forms.get('show_nsfw')?.default,
  );
  let favoriteOnly = $state(false);
  let modelTreeView = $state(
    optionState.opts.get('model_tree_view') ?? optionState.forms.get('model_tree_view')?.default,
  );

  const sortAsc = $derived<boolean>(optionState.opts.get(`${dir}_sort_asc`) ?? true);
  const sortMethod = $derived<SortType>(optionState.opts.get(`${dir}_sort`) ?? 'path');

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

  const folderFilteredModelList = $derived.by(() => {
    if (!selectedFolder) {
      return sortedModelList;
    }
    return sortedModelList.filter((model: Model) => {
      const normalizedPath = model.path.replace(/\\/g, '/');
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

    const filters = filterText
      .toLowerCase()
      .split(' ')
      .filter((f) => f.trim() !== '');
    if (filters.length === 0) {
      return list;
    }
    return list.filter((model: Model) => {
      const path = (model.path ?? '').toLowerCase();
      return filters.every((f) => path.includes(f));
    });
  });

  const PAGE_SIZE = 100;
  let currentPage = $state(0);

  $effect(() => {
    // Reset page when filter/folder/sort changes
    void filterText;
    void selectedFolder;
    void sortMethod;
    void sortAsc;
    void showNsfw;
    void favoriteOnly;
    currentPage = 0;
  });

  $effect(() => {
    optionState.setOptionValue('show_nsfw', showNsfw);
  });

  $effect(() => {
    optionState.setOptionValue('model_tree_view', modelTreeView);
  });

  $effect(() => {
    // Jump to the page containing the selected model when the list changes
    if (!focusSelectedModel || !modalState.selectedModelPath) return;
    const index = filteredModelList.findIndex((m) => m.path === modalState.selectedModelPath);
    if (index >= 0) {
      currentPage = Math.floor(index / PAGE_SIZE);
    }
  });

  const totalPages = $derived(Math.ceil(filteredModelList.length / PAGE_SIZE));
  const pagedModelList = $derived(
    filteredModelList.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
  );

  function toggleSortOrder() {
    optionState.setOptionValue(`${dir}_sort_asc`, !sortAsc);
    saveOptsWithCallback();
  }

  function changeSortType(value: SortType) {
    optionState.setOptionValue(`${dir}_sort`, value);
    saveOptsWithCallback();
  }

  let isReloading = $state(false);

  async function reloadModels() {
    isReloading = true;
    try {
      const app = appState.comfyUiState.app;
      await app?.refreshComboInNodes();
      await refreshModels(dir);
    } finally {
      isReloading = false;
    }
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
        reloadModels();
      } else {
        logger.error('Failed to delete');
      }
    } catch (e) {
      logger.error(e);
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
            class="btn btn-sm btn-outline-primary"
            for="favoriteOnlySwitch"
            style="width: 70px;">Favorite</label
          >
        </li>
        <li class="nav-item">
          <input class="btn-check" type="checkbox" id="showNsfwSwitch" bind:checked={showNsfw} />
          <label class="btn btn-sm btn-outline-primary" for="showNsfwSwitch" style="width: 70px;">
            {showNsfw ? 'ALL' : 'NSFW'}
          </label>
        </li>
      {/if}
      <li class="nav-item">
        <input class="btn-check" type="checkbox" id="useTreeView" bind:checked={modelTreeView} />
        <label class="btn btn-sm btn-outline-primary" for="useTreeView">
          <i class="bi bi-list-nested"></i>
        </label>
      </li>
      {#if !modelTreeView}
        <li class="nav-item" style="min-width: 200px;">
          <select class="form-select" name="folder" bind:value={selectedFolder}>
            <option value="">All Folders</option>
            {#each folderList as folder (folder)}
              <option value={folder}>{folder}</option>
            {/each}
          </select>
        </li>
      {/if}
      <li class="nav-item" style="width: 200px;">
        <input
          type="search"
          class="form-control"
          name="filter"
          bind:value={filterText}
          placeholder="Filter {dir}..."
        />
      </li>
      <li class="nav-item">
        <div class="btn-group" role="group">
          {#snippet sortButton(type: SortType, icon: string)}
            <!-- svelte-ignore a11y_consider_explicit_label -->
            <button
              type="button"
              class="btn btn-sm btn-outline-primary"
              name="{dir}_sort-method"
              value={type}
              onclick={() => changeSortType(type)}
              class:active={sortMethod === type}
            >
              <i class="pi {icon}"></i>
            </button>
          {/snippet}
          {@render sortButton('path', 'pi-folder')}
          {@render sortButton('name', 'pi-sort-alpha-down')}
          {@render sortButton('modified', 'pi-calendar-clock')}
          {@render sortButton('created', 'pi-calendar-plus')}
          {@render sortButton('rate', 'pi-star')}
        </div>
      </li>
      <li class="nav-item">
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          aria-label="Sort order"
          onclick={toggleSortOrder}
          ><i class="pi pi-sort-amount-down{sortAsc ? '-alt' : ''}"></i></button
        >
      </li>
      <li class="nav-item">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          aria-label="Reload models"
          disabled={isReloading}
          onclick={reloadModels}
          ><i class="pi pi-refresh {isReloading ? 'pi-spin' : ''}"></i></button
        >
      </li>
    </ul>
  </div>
</nav>

<div class="d-flex" style="flex: 1; min-height: 0;">
  {#if modelTreeView}
    <div class="border-end p-2 overflow-auto" style="width: 250px; flex-shrink: 0;">
      {#snippet treeNode(node: FolderNode)}
        <li>
          <div class="d-flex align-items-center mt-1 text-nowrap">
            {#if node.children.length > 0}
              <!-- svelte-ignore a11y_invalid_attribute -->
              <!-- svelte-ignore a11y_consider_explicit_label -->
              <a
                href="#"
                class="text-decoration-none me-1 text-secondary"
                style="width: 16px; text-align: center;"
                onclick={(e) => toggleFolder(node.path, e)}
              >
                <i class="pi {expandedFolders.has(node.path) ? 'pi-angle-down' : 'pi-angle-right'}"
                ></i>
              </a>
            {:else}
              <span style="width: 16px; margin-right: 0.25rem;"></span>
            {/if}

            <!-- svelte-ignore a11y_invalid_attribute -->
            <a
              href="#"
              class="text-decoration-none d-block"
              class:fw-bold={selectedFolder === node.path}
              onclick={(e) => {
                e.preventDefault();
                selectedFolder = node.path;
              }}
              title={node.path || 'All Folders'}
            >
              <i
                class="pi {expandedFolders.has(node.path)
                  ? 'pi-folder-open'
                  : 'pi-folder'} me-1 text-secondary"
              ></i>
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
  {/if}

  <div class="flex-grow-1 overflow-hidden d-flex flex-column">
    <div class="d-flex flex-wrap align-content-start p-2 gap-2 overflow-auto h-100">
      {#each pagedModelList as model (model.full_path + '?' + modelThumbWidth)}
        <div
          class="card rounded-2 position-relative overflow-hidden shadow-sm"
          class:selected={modalState.selectedModelPath === model.path}
          style:--modelThumbWidth="{modelThumbWidth}px;"
          data-name={model.name}
        >
          <div class="card-body p-0 w-100 h-100">
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
                  <i class="pi pi-trash"></i>
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
        <ul class="pagination justify-content-center mb-0 py-2">
          <li class="page-item" class:disabled={currentPage === 0}>
            <button class="page-link" onclick={() => (currentPage = 0)} aria-label="First"
              ><i class="pi pi-angle-double-left"></i></button
            >
          </li>
          <li class="page-item" class:disabled={currentPage === 0}>
            <button class="page-link" onclick={() => currentPage--} aria-label="Previous"
              ><i class="pi pi-angle-left"></i></button
            >
          </li>
          <li class="page-item disabled">
            <span class="page-link"
              >{currentPage + 1} / {totalPages} ({filteredModelList.length})</span
            >
          </li>
          <li class="page-item" class:disabled={currentPage >= totalPages - 1}>
            <button class="page-link" onclick={() => currentPage++} aria-label="Next"
              ><i class="pi pi-angle-right"></i></button
            >
          </li>
          <li class="page-item" class:disabled={currentPage >= totalPages - 1}>
            <button
              class="page-link"
              onclick={() => (currentPage = totalPages - 1)}
              aria-label="Last"><i class="pi pi-angle-double-right"></i></button
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

    &.selected {
      border: 3px solid var(--bs-primary);
      box-shadow: 0 0 20px rgba(var(--bs-primary-rgb), 0.5);
      transform: scale(1.02);
    }
  }
</style>
