<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowDownAZ,
    ArrowDownWideNarrow,
    ArrowUpNarrowWide,
    CalendarPlus,
    LayoutGrid,
    List,
    RotateCw,
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
  <nav class="navbar navbar-light bg-light">
    <div class="container-fluid justify-content-end">
      <ul class="navbar-nav d-flex flex-row gap-2 align-items-center">
        <!-- Search Input -->
        <li class="nav-item" style="width: 220px;">
          <div class="input-group input-group-sm">
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
          <div class="btn-group" role="group">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary btn-icon"
              class:active={workflowState.sortMethod === 'name'}
              onclick={() => workflowState.changeSortType('name')}
              title="Sort by Name"
            >
              <ArrowDownAZ size={16} />
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-primary btn-icon"
              class:active={workflowState.sortMethod === 'created'}
              onclick={() => workflowState.changeSortType('created')}
              title="Sort by Created Time"
            >
              <CalendarPlus size={16} />
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
              <ArrowUpNarrowWide size={16} />
            {:else}
              <ArrowDownWideNarrow size={16} />
            {/if}
          </button>
        </li>

        <!-- View Mode Switcher -->
        <li class="nav-item">
          <div class="btn-group" role="group">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary btn-icon"
              class:active={workflowState.viewMode === 'grid'}
              onclick={() => (workflowState.viewMode = 'grid')}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-primary btn-icon"
              class:active={workflowState.viewMode === 'list'}
              onclick={() => (workflowState.viewMode = 'list')}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </li>

        <!-- Refresh Button -->
        <li class="nav-item">
          <button
            type="button"
            class="btn btn-sm btn-primary btn-icon"
            aria-label="Reload workflows"
            disabled={workflowState.isLoading}
            onclick={() => workflowState.fetchWorkflows()}
          >
            <RotateCw size={16} class={workflowState.isLoading ? 'spin' : ''} />
          </button>
        </li>
      </ul>
    </div>
  </nav>

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
