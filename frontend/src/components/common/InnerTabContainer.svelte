<script lang="ts">
  import type { Snippet } from 'svelte';

  let { tabId, activeTabId, children }: { tabId: string; activeTabId: string; children: Snippet } =
    $props();
</script>

<div class="h-100 vstack" style:display={activeTabId === tabId ? '' : 'none'}>
  {#if children}
    {@render children()}
  {/if}
</div>
