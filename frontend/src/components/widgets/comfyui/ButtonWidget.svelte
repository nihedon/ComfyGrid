<script lang="ts">
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let {
    widget,
    labelOverride,
    variant = 'secondary',
    onclickCallback,
  }: {
    widget?: ComfyGridWidget;
    labelOverride?: string;
    variant?: string;
    onclickCallback?: () => void;
  } = $props();

  function clickAction() {
    if (onclickCallback) {
      onclickCallback();
    } else if (widget) {
      widget.clickButton();
    }
  }

  const displayText = $derived(
    labelOverride ??
      (widget ? ($t(`comfyui.widget.${widget.name}`, {}, widget.label) ?? widget.name) : 'Button'),
  );
</script>

<button
  class="btn btn-sm btn-{variant} w-100"
  title={widget?.tooltip ?? ''}
  data-id={widget?.id}
  data-name={widget?.name}
  onclick={clickAction}
>
  {displayText}
</button>
