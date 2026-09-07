<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="h-100 vstack">
  {#if children}
    {@render children()}
  {/if}
</div>
