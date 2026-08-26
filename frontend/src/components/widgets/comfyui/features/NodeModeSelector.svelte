<script lang="ts">
  import { RedoDot } from '@lucide/svelte';
  import { t } from '@/i18n/i18n';
  import { appState } from '@/states/app-state.svelte';
  import { COMFY_NODE_MODE, type ComfyNodeMode } from '@/types/model-shared';

  const {
    className,
    mode,
    handleChange,
  }: {
    className?: string;
    mode: Set<ComfyNodeMode>;
    handleChange: (e: Event, val: ComfyNodeMode) => void;
  } = $props();

  const isSimpleMode = $derived(
    (appState.optionState.get('ComfyGrid.ui.simple_node_mode') as boolean) ?? false,
  );

  const hasNormal = $derived(mode.has(COMFY_NODE_MODE.NORMAL));
  const hasBypassOrMute = $derived(
    mode.has(COMFY_NODE_MODE.BYPASS) || mode.has(COMFY_NODE_MODE.MUTE),
  );

  const isAllBypassed = $derived(hasBypassOrMute && !hasNormal);
  const isIndeterminate = $derived(hasBypassOrMute && hasNormal);

  function handleSimpleToggle(e: Event) {
    if (isAllBypassed) {
      handleChange(e, COMFY_NODE_MODE.NORMAL);
    } else {
      handleChange(e, COMFY_NODE_MODE.BYPASS);
    }
  }
</script>

{#if isSimpleMode}
  <button
    class="btn btn-xs btn-icon {className}"
    class:btn-secondary={!isAllBypassed && !isIndeterminate}
    class:btn-primary={isAllBypassed}
    class:btn-outline-primary={isIndeterminate}
    title={$t('node.mode.title', { mode: $t('node.mode.mode_type_4') })}
    onclick={handleSimpleToggle}
  >
    <RedoDot size={12}></RedoDot>
  </button>
{:else}
  <ul class="pagination pagination-xs {className}">
    {#each [[COMFY_NODE_MODE.NORMAL, 'N'], [COMFY_NODE_MODE.BYPASS, 'B'], [COMFY_NODE_MODE.MUTE, 'M']] as [selectMode, label] (selectMode)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <li
        class="page-item"
        onclick={(e) => handleChange(e, selectMode as ComfyNodeMode)}
        title={$t('node.mode.title', { mode: $t(`node.mode.mode_type_${selectMode}`) })}
        class:active={mode.has(selectMode as ComfyNodeMode)}
      >
        <!-- svelte-ignore a11y_invalid_attribute -->
        <a class="page-link" href="#">{label}</a>
      </li>
    {/each}
  </ul>
{/if}

<style lang="scss">
  .pagination {
    margin: 0;
    &.pagination-xs {
      --bs-pagination-padding-x: 0.4rem !important;
      --bs-pagination-padding-y: 0.16rem !important;
      --bs-pagination-font-size: 0.8rem !important;
    }
  }
</style>
