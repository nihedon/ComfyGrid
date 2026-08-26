<script lang="ts">
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget } = $props();
</script>

<div
  class="justify-content-start"
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
>
  {widget.value}
</div>
