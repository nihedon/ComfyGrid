import { ArrowBigDown, ArrowBigUp, LayoutDashboard } from '@lucide/svelte';
import type { BoardId } from '@/types/board';
import type { MenuEntry } from '@/types/menu';

export function createGridStackMoveMenu(translate: (key: string) => string, move: (boardId: BoardId) => void | Promise<void>): MenuEntry {
    return {
        id: 'floating',
        kind: 'submenu',
        label: translate('node.menu.move_to_grid'),
        icon: LayoutDashboard,
        items: [
            { id: 'global', kind: 'action', label: translate('node.menu.global_space'), icon: ArrowBigUp, onSelect: () => move('Global') },
            { id: 'tab', kind: 'action', label: translate('node.menu.tab_space'), icon: ArrowBigDown, onSelect: () => move('Tab') },
        ],
    };
}
