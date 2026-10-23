<script lang="ts">
  import { fetchModelDetails } from '@/services/models-service';
  import { appState } from '@/states/app-state.svelte';
  import type { Model } from '@/states/storage-state.svelte';
  import InnerTab from '../common/InnerTab.svelte';
  import InnerTabContainer from '../common/InnerTabContainer.svelte';
  import ModelList from '../common/ModelList.svelte';
  import WorkflowPage from './WorkflowPage.svelte';

  type ModelTabDefine = {
    title: string;
    subdirs?: string[];
    action?: (model: Model) => void;
  };

  const uiState = appState.uiState;

  let activeTabId: string = $state('workflows');

  let tabs: { [key: string]: ModelTabDefine } = {
    workflows: {
      title: 'Workflows',
    },
    models: {
      title: 'Models',
      subdirs: ['checkpoints', 'unet', 'diffusion_models'],
      action: (model: Model) => showDescription(model, ['checkpoints', 'unet', 'diffusion_models']),
    },
    loras: {
      title: 'LoRAs',
      subdirs: ['loras'],
      action: (model: Model) => showDescription(model, ['loras']),
    },
    embeddings: {
      title: 'Embeddings',
      subdirs: ['embeddings'],
      action: (model: Model) => showDescription(model, ['embeddings']),
    },
    hypernetworks: {
      title: 'Hypernetworks',
      subdirs: ['hypernetworks'],
      action: (model: Model) => showDescription(model, ['hypernetworks']),
    },
  };

  const activeTab = $derived(tabs[activeTabId]);

  async function showDescription(model: Model, subdirs: string[]) {
    await fetchModelDetails(model);
    appState.descriptionModalState.show(model, subdirs);
  }
</script>

<div
  id="files-page"
  class="h-100 px-1"
  style:display={uiState.activePageId === 'files' ? '' : 'none'}
>
  <div class="h-100 vstack px-1">
    <ul class="nav nav-tabs sticky-top pt-2" style="background-color: var(--bs-body-bg);">
      {#each Object.entries(tabs) as [key, tab] (key)}
        <InnerTab id={key} text={tab.title} bind:activeTabId />
      {/each}
    </ul>
    <div class="vstack overflow-y-hidden py-2">
      <InnerTabContainer>
        {#if activeTabId === 'workflows'}
          <WorkflowPage />
        {:else if activeTab?.subdirs}
          {#key activeTabId}
            <ModelList dir="models" subdirs={activeTab.subdirs} action={activeTab.action} />
          {/key}
        {/if}
      </InnerTabContainer>
    </div>
  </div>
</div>
