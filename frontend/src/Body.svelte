<script lang="ts">
  import ComfyUiPage from '@/components/pages/ComfyUiPage.svelte';
  import GridPage from '@/components/pages/GridPage.svelte';
  import ImageInfoPage from '@/components/pages/ImageInfoPage.svelte';
  import ModelPage from '@/components/pages/ModelPage.svelte';
  import SettingsPage from '@/components/pages/SettingsPage.svelte';
  import { loadPages } from '@/services/pages-service';
  import { appState } from '@/states/app-state.svelte';

  let { initializing }: { initializing?: boolean } = $props();

  const uiState = appState.uiState;
  const comfyUiState = appState.comfyUiState;
</script>

<section
  class="h-100 position-relative overflow-y-auto"
  style:display={comfyUiState.graphReady ? '' : 'none'}
  style:opacity={initializing ? '0' : ''}
  style:pointer-events={!comfyUiState.graphReady || initializing ? 'none' : ''}
>
  <GridPage />
  <ComfyUiPage />
  <ImageInfoPage />

  {#await loadPages() then extraPages}
    {#each extraPages as page (page.id)}
      <div style:display={uiState.activePageId === page.id ? '' : 'none'}>
        <!-- TODO -->
      </div>
    {/each}
  {/await}

  {#if uiState.activePageId === 'model'}
    <ModelPage />
  {/if}

  {#if uiState.activePageId === 'settings'}
    <SettingsPage />
  {/if}
</section>
