<script lang="ts">
  import { Ban, Power, RedoDot } from '@lucide/svelte';
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
  const modeOptions = [
    { value: COMFY_NODE_MODE.NORMAL, icon: Power },
    { value: COMFY_NODE_MODE.BYPASS, icon: RedoDot },
    { value: COMFY_NODE_MODE.MUTE, icon: Ban },
  ];

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
    class:btn-secondary={isAllBypassed}
    class:active={hasNormal && !isIndeterminate}
    class:btn-outline-primary={isIndeterminate}
    aria-pressed={isIndeterminate ? 'mixed' : hasNormal}
    title={$t('node.mode.title', {
      mode: $t(isAllBypassed ? 'node.mode.mode_type_0' : 'node.mode.mode_type_4'),
    })}
    onclick={handleSimpleToggle}
  >
    <Power size={12} />
  </button>
{:else}
  <div class="btn-group {className}" role="group">
    {#each modeOptions as { value: selectMode, icon: Icon } (selectMode)}
      <button
        class="btn btn-icon"
        class:active={mode.has(selectMode as ComfyNodeMode)}
        class:btn-secondary={!mode.has(selectMode as ComfyNodeMode)}
        onclick={(e) => handleChange(e, selectMode as ComfyNodeMode)}
        title={$t('node.mode.title', { mode: $t(`node.mode.mode_type_${selectMode}`) })}
        aria-label={$t('node.mode.title', { mode: $t(`node.mode.mode_type_${selectMode}`) })}
      >
        <Icon size={12} />
      </button>
    {/each}
  </div>
{/if}
