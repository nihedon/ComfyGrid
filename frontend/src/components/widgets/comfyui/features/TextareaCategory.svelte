<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '@/i18n/i18n';
  import { callLayoutChangedCallbacks } from '@/services/callback-service';
  import { saveLayoutObject } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget } = $props();

  const workspaceState = appState.workspaceState;

  let textareaElement = $state<HTMLTextAreaElement>()!;

  const layout = $derived(workspaceState.layout);

  const isPrompt = $derived(layout.isPromptWidget(widget.id));
  const isPositivePrompt = $derived(layout.positivePromptWidgetId === widget.id);
  const isNegativePrompt = $derived(layout.negativePromptWidgetId === widget.id);

  const textCategoryLabel = $derived.by(() => {
    if (isPrompt) {
      return $t('widget.select.prompt.title');
    } else if (isPositivePrompt) {
      return $t('widget.select.positive_prompt.title');
    } else if (isNegativePrompt) {
      return $t('widget.select.negative_prompt.title');
    }
    return $t('widget.select.text.title');
  });

  function changeToText() {
    if (isPrompt) {
      layout.deletePromptWidgetId(widget.id);
    } else if (isPositivePrompt) {
      layout.setPositivePromptWidgetId(null);
    } else if (isNegativePrompt) {
      layout.setNegativePromptWidgetId(null);
    }
    saveLayoutObject(layout);
    tick().then(() => {
      callLayoutChangedCallbacks();
    });
  }

  function changeToPrompt() {
    if (isPrompt) {
      return;
    } else if (isPositivePrompt) {
      layout.setPositivePromptWidgetId(null);
    } else if (isNegativePrompt) {
      layout.setNegativePromptWidgetId(null);
    }
    layout.addPromptWidgetId(widget.id);
    saveLayoutObject(layout);
    tick().then(() => {
      callLayoutChangedCallbacks();
    });
  }

  function changeToPositivePrompt() {
    if (isPrompt) {
      layout.deletePromptWidgetId(widget.id);
    } else if (isPositivePrompt) {
      return;
    } else if (isNegativePrompt) {
      layout.setNegativePromptWidgetId(null);
    }
    if (layout.positivePromptWidgetId) {
      layout.addPromptWidgetId(layout.positivePromptWidgetId);
    }
    layout.setPositivePromptWidgetId(widget.id);
    saveLayoutObject(layout);
    tick().then(() => {
      callLayoutChangedCallbacks();
    });
  }

  function changeToNegativePrompt() {
    if (isPrompt) {
      layout.deletePromptWidgetId(widget.id);
    } else if (isPositivePrompt) {
      layout.setPositivePromptWidgetId(null);
    } else if (isNegativePrompt) {
      return;
    }
    if (layout.negativePromptWidgetId) {
      layout.addPromptWidgetId(layout.negativePromptWidgetId);
    }
    layout.setNegativePromptWidgetId(widget.id);
    saveLayoutObject(layout);
    tick().then(() => {
      callLayoutChangedCallbacks();
    });
  }

  $effect(() => {
    widget.textarea = textareaElement;
  });
</script>

<div class="dropdown dropend">
  <!-- svelte-ignore a11y_missing_attribute -->
  <a class="nav-link dropdown-toggle text-capitalize" role="button" data-bs-toggle="dropdown">
    {textCategoryLabel}
  </a>
  <ul class="dropdown-menu">
    <li>
      <button class="dropdown-item py-0" onclick={changeToText}
        >{$t('widget.select.text.title')}</button
      >
    </li>
    <li>
      <button class="dropdown-item py-0" onclick={changeToPrompt}
        >{$t('widget.select.prompt.title')}</button
      >
    </li>
    <li>
      <button class="dropdown-item py-0" onclick={changeToPositivePrompt}
        >{$t('widget.select.positive_prompt.title')}</button
      >
    </li>
    <li>
      <button class="dropdown-item py-0" onclick={changeToNegativePrompt}
        >{$t('widget.select.negative_prompt.title')}</button
      >
    </li>
  </ul>
</div>
