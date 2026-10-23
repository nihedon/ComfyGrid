<script lang="ts">
  import { ContextMenu, DropdownMenu } from 'bits-ui';
  import type { MenuEntry, MenuTrigger } from '@/types/menu';
  import MenuItems from './MenuItems.svelte';

  let {
    trigger,
    items,
    context = false,
    disabled = false,
    align = 'start',
    side,
    onOpenChange,
  }: {
    trigger: MenuTrigger;
    items: MenuEntry[];
    context?: boolean;
    disabled?: boolean;
    align?: 'start' | 'end' | 'center';
    side?: 'top' | 'right' | 'bottom' | 'left';
    onOpenChange?: (open: boolean) => void;
  } = $props();
  const Menu = $derived(context ? ContextMenu : DropdownMenu);
</script>

<Menu.Root {onOpenChange}>
  <Menu.Trigger {disabled}>
    {#snippet child({ props })}{@render trigger({ props })}{/snippet}
  </Menu.Trigger>
  <Menu.Portal>
    <Menu.Content
      class="dropdown-menu show cg-menu"
      {align}
      side={side ?? 'bottom'}
      sideOffset={4}
      collisionPadding={8}
      preventScroll={false}
    >
      <MenuItems {items} {context} />
    </Menu.Content>
  </Menu.Portal>
</Menu.Root>
