<script lang="ts">
  import { Check, ChevronRight } from '@lucide/svelte';
  import { ContextMenu, DropdownMenu } from 'bits-ui';
  import type { MenuEntry } from '@/types/menu';

  let { items, context = false }: { items: MenuEntry[]; context?: boolean } = $props();
  const Menu = $derived(context ? ContextMenu : DropdownMenu);
</script>

{#snippet entries(menuItems: MenuEntry[])}
  {#each menuItems as item (item.id)}
    {#if item.kind === 'separator'}
      <Menu.Separator class="dropdown-divider my-1" />
    {:else if item.kind === 'radio' || item.kind === 'submenu'}
      <Menu.Sub>
        <Menu.SubTrigger class="dropdown-item cg-menu-item" disabled={item.disabled}>
          <span class="cg-menu-icon"
            >{#if item.icon}<item.icon size={14} />{/if}</span
          >
          <span class="cg-menu-label">{item.label}</span><ChevronRight size={14} />
        </Menu.SubTrigger>
        <Menu.Portal>
          <Menu.SubContent
            class="dropdown-menu show cg-menu cg-menu-sub"
            sideOffset={2}
            collisionPadding={8}
          >
            {#if item.kind === 'submenu'}
              {@render entries(item.items)}
            {:else}
              <Menu.RadioGroup value={item.value} onValueChange={item.onValueChange}>
                {#each item.options as option (option.value)}
                  <Menu.RadioItem class="dropdown-item cg-menu-item" value={option.value}>
                    {#snippet children({ checked })}
                      <span class="cg-menu-icon"
                        >{#if checked}<Check size={14} />{/if}</span
                      >
                      <span class="cg-menu-label">{option.label}</span>
                    {/snippet}
                  </Menu.RadioItem>
                {/each}
              </Menu.RadioGroup>
            {/if}
          </Menu.SubContent>
        </Menu.Portal>
      </Menu.Sub>
    {:else if item.kind === 'checkbox'}
      <Menu.CheckboxItem
        class="dropdown-item cg-menu-item"
        checked={item.checked}
        onCheckedChange={item.onCheckedChange}
        disabled={item.disabled}
        closeOnSelect={false}
      >
        {#snippet children({ checked })}
          <span class="cg-menu-icon"
            >{#if checked}<Check size={14} />{/if}</span
          >
          <span class="cg-menu-label">{item.label}</span>
        {/snippet}
      </Menu.CheckboxItem>
    {:else}
      <Menu.Item
        class="dropdown-item cg-menu-item {item.danger ? 'text-danger' : ''}"
        disabled={item.disabled}
        title={item.hint}
        onSelect={() => item.onSelect()}
      >
        <span class="cg-menu-icon">
          {#if item.selected}<Check size={14} />{:else if item.icon}<item.icon size={14} />{/if}
        </span>
        <span class="cg-menu-label">{item.label}</span>
      </Menu.Item>
    {/if}
  {/each}
{/snippet}

{@render entries(items)}
