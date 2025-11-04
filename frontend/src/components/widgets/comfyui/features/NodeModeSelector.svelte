<script lang="ts">
  import { t } from '@/i18n/i18n';
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
</script>

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
