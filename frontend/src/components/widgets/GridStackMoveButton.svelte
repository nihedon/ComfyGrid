<script lang="ts">
  import { LayoutDashboard } from '@lucide/svelte';
  import AppMenu from '@/components/common/AppMenu.svelte';
  import { t } from '@/i18n/i18n';
  import type { MenuEntry } from '@/types/menu';

  let { items, isFloating = false }: { items: MenuEntry[]; isFloating?: boolean } = $props();

  const moveItems = $derived(
    items.flatMap((item) => (item.kind === 'submenu' ? item.items : [item])),
  );
</script>

<AppMenu items={moveItems} align="end">
  {#snippet trigger({ props })}
    <button
      {...props}
      type="button"
      class="btn btn-xs btn-icon gridstack-move-button"
      class:active={isFloating}
      title={$t('node.menu.move')}
      aria-label={$t('node.menu.move')}
    >
      <LayoutDashboard size={12} />
    </button>
  {/snippet}
</AppMenu>

<style lang="scss">
  .gridstack-move-button {
    --bs-btn-active-color: #fff;
    --bs-btn-active-bg: var(--bs-primary);
    --bs-btn-active-border-color: var(--bs-primary);
  }
</style>
