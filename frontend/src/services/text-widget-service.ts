import { tick } from 'svelte';
import { callLayoutChangedCallbacks } from '@/services/callback-service';
import { saveLayoutObject } from '@/services/gridstack-service';
import { appState } from '@/states/app-state.svelte';
import type { ComfyGridWidget } from '@/states/model-state.svelte';

export const TEXT_CATEGORIES = ['text', 'json', 'prompt', 'positive_prompt', 'negative_prompt', 'translate'] as const;
export type TextCategory = (typeof TEXT_CATEGORIES)[number];

export function getTextCategory(widget: ComfyGridWidget): TextCategory {
    const layout = appState.workspaceState.layout;
    if (layout.isJsonWidget(widget.id)) return 'json';
    if (layout.isTranslateWidget(widget.id)) return 'translate';
    if (layout.isPromptWidget(widget.id)) return 'prompt';
    if (layout.positivePromptWidgetId === widget.id) return 'positive_prompt';
    if (layout.negativePromptWidgetId === widget.id) return 'negative_prompt';
    return 'text';
}

export async function setTextCategory(widget: ComfyGridWidget, category: TextCategory) {
    if (getTextCategory(widget) === category) return;
    const layout = appState.workspaceState.layout;
    const oldPositive = layout.positivePromptWidgetId;
    const oldNegative = layout.negativePromptWidgetId;
    layout.deletePromptWidgetId(widget.id);
    if (oldPositive === widget.id) layout.setPositivePromptWidgetId(null);
    if (oldNegative === widget.id) layout.setNegativePromptWidgetId(null);
    layout.deleteTranslateWidgetId(widget.id);
    layout.setJsonWidget(widget.id, category === 'json');
    if (category === 'prompt') layout.addPromptWidgetId(widget.id);
    else if (category === 'positive_prompt') {
        if (oldPositive && oldPositive !== widget.id) layout.addPromptWidgetId(oldPositive);
        layout.setPositivePromptWidgetId(widget.id);
    } else if (category === 'negative_prompt') {
        if (oldNegative && oldNegative !== widget.id) layout.addPromptWidgetId(oldNegative);
        layout.setNegativePromptWidgetId(widget.id);
    } else if (category === 'translate') {
        layout.addTranslateWidgetId(widget.id);
        widget.initializeRawValue();
    }
    saveLayoutObject(layout);
    await tick();
    callLayoutChangedCallbacks();
}
