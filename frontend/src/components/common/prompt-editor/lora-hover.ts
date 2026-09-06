import { completionStatus } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { appState } from '@/states/app-state.svelte';
import type { Model } from '@/states/storage-state.svelte';

const HOVER_DELAY_MS = 250;
const SLICE_RANGE = 200;
const LORA_TAG_REGEX = /<(?:lora|lyco):([^:>]+)(?::[^>]*)?>/gi;

function findLoraAtPosition(text: string, pos: number): { name: string; from: number; to: number } | null {
    const searchStart = Math.max(0, pos - SLICE_RANGE);
    const searchEnd = Math.min(text.length, pos + SLICE_RANGE);
    const slice = text.slice(searchStart, searchEnd);
    const offsetInSlice = pos - searchStart;

    LORA_TAG_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LORA_TAG_REGEX.exec(slice)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (offsetInSlice >= start && offsetInSlice <= end) {
            return {
                name: match[1].trim(),
                from: searchStart + start,
                to: searchStart + end,
            };
        }
    }
    return null;
}

function findLoraModel(name: string): Model | undefined {
    const cleanName = name.trim();
    return Array.from(appState.storageState.models.values()).find(
        (m) =>
            m.category === 'loras' &&
            (m.name === cleanName || m.path.replaceAll('\\', '/').replace(/\.[^/.]+$/, '') === cleanName || m.path.replaceAll('\\', '/') === cleanName),
    );
}

function getLoraElement(view: EditorView, from: number): HTMLElement | null {
    try {
        const domAt = view.domAtPos(from);
        const node = domAt.node;
        const element = node instanceof HTMLElement ? node : node.parentElement;
        return element?.closest<HTMLElement>('.cm-prompt-word') || element;
    } catch {
        return null;
    }
}

export function loraHoverPlugin(): Extension {
    let hoverTimer: number | null = null;
    let lastHoveredLora: string | null = null;

    function cancelHoverTimer(): void {
        if (hoverTimer !== null) {
            window.clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    }

    function hideLoraPopover(): void {
        cancelHoverTimer();
        if (lastHoveredLora !== null) {
            lastHoveredLora = null;
            if (appState.popoverState.visible) {
                appState.popoverState.hidePopover();
            }
        }
    }

    return [
        EditorView.domEventHandlers({
            mousemove(event, view) {
                if (completionStatus(view.state) !== null) {
                    return false;
                }

                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                if (pos === null) {
                    hideLoraPopover();
                    return false;
                }

                const loraInfo = findLoraAtPosition(view.state.doc.toString(), pos);
                if (!loraInfo) {
                    hideLoraPopover();
                    return false;
                }

                if (lastHoveredLora === loraInfo.name && appState.popoverState.visible) {
                    return false;
                }

                cancelHoverTimer();
                hoverTimer = window.setTimeout(() => {
                    const model = findLoraModel(loraInfo.name);
                    if (!model) return;

                    const showNsfw = Boolean(appState.optionState.get('ComfyGrid.ui.show_nsfw'));
                    if (showNsfw || !model.nsfw) {
                        const targetEl = getLoraElement(view, loraInfo.from) || (event.target as HTMLElement);
                        lastHoveredLora = loraInfo.name;
                        appState.popoverState.showModelPopover(targetEl, model, 'models');
                    }
                }, HOVER_DELAY_MS);

                return false;
            },
            mouseleave() {
                hideLoraPopover();
                return false;
            },
        }),
        EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet) {
                hideLoraPopover();
            }
        }),
    ];
}
