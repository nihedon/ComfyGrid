<script lang="ts">
  import { t } from '@/i18n/i18n';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridGroup, ComfyGridNode } from '@/states/model-state.svelte';
  import type { Model } from '@/states/storage-state.svelte';
  import { toastState } from '@/states/toast-state.svelte';
  import Tab from '../common/InnerTab.svelte';
  import TabContainer from '../common/InnerTabContainer.svelte';
  import ModelList from '../common/ModelList.svelte';

  type ModelTabDefine = {
    title: string;
    subdirs: string[];
    action: (model: Model) => void;
  };

  const uiState = appState.uiState;
  const workspaceState = appState.workspaceState;

  let activeTabId: string = $state('models');

  let tabs: { [key: string]: ModelTabDefine } = {
    models: {
      title: 'Models',
      subdirs: ['checkpoints', 'unet', 'diffusion_models'],
      action: () => {},
    },
    loras: {
      title: 'LoRAs',
      subdirs: ['loras'],
      action: (model: Model) => appendModelTagToPrompt('lora', model),
    },
    embeddings: {
      title: 'Embeddings',
      subdirs: ['embeddings'],
      action: appendKeywordToPrompt,
    },
    hypernetworks: {
      title: 'Hypernetworks',
      subdirs: ['hypernetworks'],
      action: (model: Model) => appendModelTagToPrompt('hypernet', model),
    },
  };

  const activeTab = $derived(tabs[activeTabId]);

  function collectAllNodes(groups: readonly ComfyGridGroup[]): ComfyGridNode[] {
    return groups.flatMap((g) => [...g.nodes, ...collectAllNodes(g.children)]);
  }

  const positivePromptTextarea = $derived.by(() => {
    return collectAllNodes(workspaceState.groups)
      .flatMap((n) => n.widgets)
      .find((w) => w.id === workspaceState.layout.positivePromptWidgetId)?.textarea;
  });

  function appendKeywordToPrompt(model: Model) {
    const name = model.name;
    const textarea = positivePromptTextarea;
    if (!textarea) {
      alert($t('alert_no_positive_prompt_selected'));
      return;
    } else {
      textarea.value += `, embedding:${name}`;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      toastState.addToast({
        type: 'success',
        message: $t('toast.append_embedding_tag_to_positive_prompt'),
      });
    }
  }

  function appendModelTagToPrompt(tag: string, model: Model) {
    const name = model.name;
    const textarea = positivePromptTextarea;
    if (!textarea) {
      alert($t('alert_no_positive_prompt_selected'));
      return;
    } else {
      textarea.value += ` <${tag}:${name}:1>`;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      if (tag === 'lora') {
        toastState.addToast({
          type: 'success',
          message: $t('toast.append_lora_tag_to_positive_prompt'),
        });
      } else {
        toastState.addToast({
          type: 'success',
          message: $t('toast.append_hypernetwork_tag_to_positive_prompt'),
        });
      }
    }
  }
</script>

<div
  id="model-page"
  class="h-100 px-1"
  style:display={uiState.activePageId === 'model' ? '' : 'none'}
>
  <div class="h-100 vstack px-1">
    <ul class="nav nav-tabs sticky-top pt-2" style="background-color: var(--bs-body-bg);">
      {#each Object.entries(tabs) as [key, tab] (key)}
        <Tab id={key} text={tab.title} bind:activeTabId />
      {/each}
    </ul>
    <div class="vstack overflow-y-hidden py-2">
      <TabContainer tabId={activeTabId} {activeTabId}>
        {#key activeTabId}
          <ModelList dir="models" subdirs={activeTab.subdirs} action={activeTab.action} />
        {/key}
      </TabContainer>
    </div>
  </div>
</div>
