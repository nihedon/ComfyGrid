<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowDownAZ,
    ArrowDownWideNarrow,
    ArrowUpNarrowWide,
    CalendarPlus,
    LayoutGrid,
    List,
    RefreshCw,
    Search,
  } from '@lucide/svelte';
  import { workflowState } from '@/states/workflow-state.svelte';
  import WorkflowGrid from '../sections/workflow/WorkflowGrid.svelte';
  import WorkflowList from '../sections/workflow/WorkflowList.svelte';
  import WorkflowTree from '../sections/workflow/WorkflowTree.svelte';

  onMount(() => {
    workflowState.fetchWorkflows();
  });
</script>

<div class="d-flex flex-column h-100 bg-body">
  <!-- Toolbar -->
  <div class="navbar navbar-light bg-light">
    <div class="container-fluid justify-content-between">
      <div class="d-flex align-items-center gap-2">
        <button
          class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
          onclick={() => workflowState.fetchWorkflows()}
          disabled={workflowState.isLoading}
          title="Refresh"
        >
          <RefreshCw size={14} class={workflowState.isLoading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>

        <!-- Breadcrumbs -->
        <nav aria-label="breadcrumb" class="ms-2">
          <ol class="breadcrumb mb-0 py-1 px-3 fs-7">
            <li
              class="breadcrumb-item"
              class:active={!workflowState.selectedFolder && !workflowState.isFavoriteView}
            >
              <!-- svelte-ignore a11y_invalid_attribute -->
              <a
                href="#"
                onclick={(e) => {
                  e.preventDefault();
                  workflowState.isFavoriteView = false;
                  workflowState.selectedFolder = '';
                }}
              >
                Workflow
              </a>
            </li>
            {#if workflowState.isFavoriteView}
              <li class="breadcrumb-item active text-warning fw-semibold">Favorites</li>
            {:else if workflowState.selectedFolder}
              {@const parts = workflowState.selectedFolder.split('/')}
              {#each parts as part, i (`${part}-${i}`)}
                {@const currentPath = parts.slice(0, i + 1).join('/')}
                <li class="breadcrumb-item" class:active={i === parts.length - 1}>
                  {#if i === parts.length - 1}
                    {part}
                  {:else}
                    <!-- svelte-ignore a11y_invalid_attribute -->
                    <a
                      href="#"
                      onclick={(e) => {
                        e.preventDefault();
                        workflowState.selectedFolder = currentPath;
                      }}
                    >
                      {part}
                    </a>
                  {/if}
                </li>
              {/each}
            {/if}
          </ol>
        </nav>
      </div>

      <ul class="navbar-nav d-flex flex-row gap-2 align-items-center">
        <!-- Search Input -->
        <li class="nav-item">
          <div class="input-group input-group-sm" style="width: 220px;">
            <span class="input-group-text">
              <Search size={14} class="text-body-secondary" />
            </span>
            <input
              type="text"
              class="form-control"
              placeholder="Search workflows..."
              bind:value={workflowState.searchQuery}
            />
          </div>
        </li>

        <!-- Sort Method Switcher -->
        <li class="nav-item">
          <div class="btn-group btn-group" role="group">
            <button
              type="button"
              class="btn btn-outline-primary btn-icon"
              class:active={workflowState.sortMethod === 'name'}
              onclick={() => workflowState.changeSortType('name')}
              title="Sort by Name"
            >
              <ArrowDownAZ size={14} />
            </button>
            <button
              type="button"
              class="btn btn-outline-primary btn-icon"
              class:active={workflowState.sortMethod === 'created'}
              onclick={() => workflowState.changeSortType('created')}
              title="Sort by Created Time"
            >
              <CalendarPlus size={14} />
            </button>
          </div>
        </li>

        <!-- Sort Order Toggle -->
        <li class="nav-item">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary btn-icon"
            onclick={() => workflowState.toggleSortOrder()}
            title={workflowState.sortAsc ? 'Ascending' : 'Descending'}
            aria-label="Sort order"
          >
            {#if workflowState.sortAsc}
              <ArrowUpNarrowWide size={14} />
            {:else}
              <ArrowDownWideNarrow size={14} />
            {/if}
          </button>
        </li>

        <!-- View Mode Switcher -->
        <li class="nav-item">
          <div class="btn-group btn-group" role="group">
            <button
              type="button"
              class="btn btn-primary btn-icon"
              class:active={workflowState.viewMode === 'grid'}
              onclick={() => (workflowState.viewMode = 'grid')}
              title="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              class="btn btn-primary btn-icon"
              class:active={workflowState.viewMode === 'list'}
              onclick={() => (workflowState.viewMode = 'list')}
              title="List view"
            >
              <List size={14} />
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>

  <!-- Content (Sidebar + Main) -->
  <div class="d-flex flex-grow-1 overflow-hidden">
    <WorkflowTree />

    <div class="flex-grow-1 overflow-y-auto">
      {#if workflowState.viewMode === 'grid'}
        <WorkflowGrid />
      {:else}
        <WorkflowList />
      {/if}

      {#if !workflowState.isLoading && workflowState.currentFolderItems.length === 0}
        <div
          class="d-flex flex-column align-items-center justify-content-center h-100 text-body-secondary p-5"
        >
          <span class="fs-6 mb-2">No workflows found</span>
          <span class="fs-7">Create a folder or save a workflow in ComfyUI to see it here.</span>
        </div>
      {/if}
    </div>
  </div>
</div>
