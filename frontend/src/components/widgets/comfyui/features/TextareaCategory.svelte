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
  const isTranslate = $derived(layout.isTranslateWidget(widget.id));
  const isTranslating = $derived(widget.isTranslating);

  const textCategoryLabel = $derived.by(() => {
    if (isTranslate) {
      return $t('widget.select.translate.title');
    } else if (isPrompt) {
      return $t('widget.select.prompt.title');
    } else if (isPositivePrompt) {
      return $t('widget.select.positive_prompt.title');
    } else if (isNegativePrompt) {
      return $t('widget.select.negative_prompt.title');
    }
    return $t('widget.select.text.title');
  });

  function clearCategory() {
    if (isPrompt) layout.deletePromptWidgetId(widget.id);
    if (isPositivePrompt) layout.setPositivePromptWidgetId(null);
    if (isNegativePrompt) layout.setNegativePromptWidgetId(null);
    if (isTranslate) layout.deleteTranslateWidgetId(widget.id);
  }

  function changeToText() {
    clearCategory();
    saveLayoutObject(layout);
    tick().then(() => {
      callLayoutChangedCallbacks();
    });
  }

  function changeToPrompt() {
    if (isPrompt) return;
    clearCategory();
    layout.addPromptWidgetId(widget.id);
    saveLayoutObject(layout);
    tick().then(() => {
      callLayoutChangedCallbacks();
    });
  }

  function changeToPositivePrompt() {
    if (isPositivePrompt) return;
    const oldPositive = layout.positivePromptWidgetId;
    clearCategory();
    if (oldPositive) {
      layout.addPromptWidgetId(oldPositive);
    }
    layout.setPositivePromptWidgetId(widget.id);
    saveLayoutObject(layout);
    tick().then(() => {
      callLayoutChangedCallbacks();
    });
  }

  function changeToNegativePrompt() {
    if (isNegativePrompt) return;
    const oldNegative = layout.negativePromptWidgetId;
    clearCategory();
    if (oldNegative) {
      layout.addPromptWidgetId(oldNegative);
    }
    layout.setNegativePromptWidgetId(widget.id);
    saveLayoutObject(layout);
    tick().then(() => {
      callLayoutChangedCallbacks();
    });
  }

  function changeToTranslate() {
    if (isTranslate) return;
    clearCategory();
    layout.addTranslateWidgetId(widget.id);
    saveLayoutObject(layout);
    tick().then(() => {
      callLayoutChangedCallbacks();
    });
  }

  function openSettingModal() {
    appState.ollamaSettingModalState.show(widget.id);
  }

  $effect(() => {
    widget.textarea = textareaElement;
  });
</script>

<div class="dropdown dropend d-inline-flex align-items-center">
  <!-- svelte-ignore a11y_missing_attribute -->
  <a class="nav-link dropdown-toggle text-capitalize me-2" role="button" data-bs-toggle="dropdown">
    {textCategoryLabel}
  </a>
  {#if isTranslate}
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button class="btn btn-xs btn-secondary" onclick={openSettingModal}>
      <i class="pi pi-cog"></i>
    </button>
  {/if}
  {#if isTranslate && isTranslating}
    <span class="badge text-bg-primary ms-2 fs-7">
      <i class="pi pi-spin pi-spinner me-1"></i>
      {$t('widget.translate.indicator')}
    </span>
  {/if}
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
    <li>
      <button class="dropdown-item py-0" onclick={changeToTranslate}
        >{$t('widget.select.translate.title')}</button
      >
    </li>
  </ul>
</div>
