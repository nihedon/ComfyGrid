import type { Snippet } from 'svelte';
import type { Check } from '@lucide/svelte';

export type MenuTrigger = Snippet<[{ props: Record<string, unknown> }]>;
type MenuLabel = { id: string; label: string; icon?: typeof Check; disabled?: boolean; hint?: string; danger?: boolean };
export type MenuEntry =
    | { id: string; kind: 'separator' }
    | (MenuLabel & { kind: 'action'; onSelect: () => void | Promise<void>; selected?: boolean })
    | (MenuLabel & { kind: 'submenu'; items: MenuEntry[] })
    | (MenuLabel & { kind: 'checkbox'; checked: boolean; onCheckedChange: (checked: boolean) => void })
    | (MenuLabel & { kind: 'radio'; value: string; options: Array<{ value: string; label: string }>; onValueChange: (value: string) => void });
