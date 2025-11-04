<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BOOTSWATCH_THEME_OPT_KEY,
    type BootswatchTheme,
    fetchBootswatchThemes,
    selectBootswatchTheme,
  } from '@/services/bootswatch-service';
  import { saveOptsWithCallback } from '@/services/options-service';
  import { appState } from '@/states/app-state.svelte';

  let themes = $state<BootswatchTheme[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const selectedUrl = $derived(
    (appState.optionState.opts.get(BOOTSWATCH_THEME_OPT_KEY) as string) ?? '',
  );

  onMount(async () => {
    try {
      themes = await fetchBootswatchThemes();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      loading = false;
    }
  });

  function handleSelectTheme(cssCdnUrl: string): void {
    selectBootswatchTheme(cssCdnUrl);
    saveOptsWithCallback();
  }
</script>

<div class="bootswatch-picker">
  {#if loading}
    <div class="d-flex align-items-center gap-2 text-body-secondary py-2">
      <div class="spinner-border spinner-border-sm" role="status"></div>
      <span>Loading Bootswatch themes...</span>
    </div>
  {:else if error}
    <div class="alert alert-warning d-flex align-items-center gap-2 py-2">
      <i class="pi pi-exclamation-triangle"></i>
      <span>Failed to load themes: {error}</span>
    </div>
  {:else}
    <div class="row row-cols-2 row-cols-md-3 row-cols-xl-4 g-2">
      <div class="col">
        <button
          type="button"
          class="theme-card card w-100 text-start border-2"
          class:border-primary={selectedUrl === ''}
          onclick={() => handleSelectTheme('')}
        >
          <div class="default-theme-preview d-flex align-items-center justify-content-center">
            <span class="fw-bold fs-3" style="color: white; opacity: 0.9;">B</span>
          </div>
          <div class="card-body p-2">
            <div class="d-flex align-items-center justify-content-between gap-1">
              <span class="fw-semibold text-truncate small">Default</span>
              {#if selectedUrl === ''}
                <i class="pi pi-check text-primary flex-shrink-0"></i>
              {/if}
            </div>
            <div class="text-body-secondary text-truncate" style="font-size: 0.7rem;">
              Bootstrap default
            </div>
          </div>
        </button>
      </div>

      {#each themes as theme (theme.cssCdn)}
        <div class="col">
          <button
            type="button"
            class="theme-card card w-100 text-start border-2"
            class:border-primary={selectedUrl === theme.cssCdn}
            onclick={() => handleSelectTheme(theme.cssCdn)}
          >
            <img
              class="theme-thumbnail card-img-top"
              src={theme.thumbnail}
              alt={theme.name}
              loading="lazy"
            />
            <div class="card-body p-2">
              <div class="d-flex align-items-center justify-content-between gap-1">
                <span class="fw-semibold text-truncate small">{theme.name}</span>
                {#if selectedUrl === theme.cssCdn}
                  <i class="pi pi-check text-primary flex-shrink-0"></i>
                {/if}
              </div>
              <div class="text-body-secondary text-truncate" style="font-size: 0.7rem;">
                {theme.description}
              </div>
            </div>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .theme-card {
    cursor: pointer;
    transition:
      box-shadow 0.15s ease,
      border-color 0.15s ease;
    background-color: var(--bs-card-bg);
    color: inherit;
  }

  .theme-card:hover {
    box-shadow: 0 0.25rem 0.75rem rgba(0, 0, 0, 0.15);
  }

  .theme-thumbnail {
    height: 72px;
    object-fit: cover;
    object-position: top left;
  }

  .default-theme-preview {
    height: 72px;
    background: linear-gradient(135deg, #7952b3 0%, #3d1d8a 100%);
  }
</style>
