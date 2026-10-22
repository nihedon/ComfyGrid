<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { comfyGridApiClient } from '@/api/api-client';
  import AppMenu from '@/components/common/AppMenu.svelte';
  import JsonEditor from '@/components/common/JsonEditor.svelte';
  import PromptEditor from '@/components/common/PromptEditor.svelte';
  import { t } from '@/i18n/i18n';
  import {
    activateTabForNode,
    saveLayoutObject,
    updateBoardFloatingState,
  } from '@/services/gridstack-service';
  import { notifyTranslationError } from '@/services/translation-error-service';
  import { translationManager } from '@/services/translation-service.svelte';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';
  import type { BoardId } from '@/types/board';
  import GridStackMoveButton from '../GridStackMoveButton.svelte';
  import { createGridStackMoveMenu } from '../node-layout-menu';
  import TextareaCategory from './features/TextareaCategory.svelte';

  let {
    widget,
    options,
  }: { widget: ComfyGridWidget; options: { isFloating: boolean; isTextareaOnly: boolean } } =
    $props();

  const workspaceState = appState.workspaceState;

  let textareaElement = $state<HTMLTextAreaElement>()!;

  const layout = $derived(workspaceState.layout);

  const isPrompt = $derived(layout.isPromptWidget(widget.id));
  const isPositivePrompt = $derived(layout.positivePromptWidgetId === widget.id);
  const isNegativePrompt = $derived(layout.negativePromptWidgetId === widget.id);
  const isTranslate = $derived(layout.isTranslateWidget(widget.id));
  const translateSeedMode = $derived(
    layout.getTranslateSeedMode(widget.id) ??
      (appState.optionState.get('ComfyGrid.ollama.seed_mode') === 'random' ? 'random' : 'fixed'),
  );
  const useOllamaCodeMirror = $derived(
    Boolean(appState.optionState.get('ComfyGrid.ollama.use_codemirror')),
  );
  const isPromptGroup = $derived(isPrompt || isPositivePrompt || isNegativePrompt);

  function getRawInputValue(): string {
    return widget.rawValue ?? widget.value ?? '';
  }

  function setRawInputValue(value: string) {
    widget.rawValue = value;
  }

  let activeTranslationText = '';
  let activeTranslationPromise: Promise<void> | null = null;
  let activeTranslationRequestId = 0;
  let inputTimer: ReturnType<typeof setTimeout> | null = null;
  let translationRequestId = 0;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const translationControllers = new Set<AbortController>();

  const layoutMenuItems = $derived([createGridStackMoveMenu($t, moveToBoard)]);

  async function triggerTranslation(text: string): Promise<void> {
    if (
      activeTranslationRequestId === translationRequestId &&
      activeTranslationText === text &&
      activeTranslationPromise
    ) {
      return activeTranslationPromise;
    }

    if (activeTranslationPromise) {
      const requestedVersion = translationRequestId;
      await activeTranslationPromise;
      if (requestedVersion !== translationRequestId || !isTranslate) return;
      return triggerTranslation(text);
    }

    if (!widget.isDirty && !widget.translationFailed) {
      return;
    }

    activeTranslationText = text;
    const currentReqId = ++translationRequestId;
    activeTranslationRequestId = currentReqId;

    const execute = async () => {
      if (!text.trim()) {
        if (currentReqId === translationRequestId) {
          widget.value = text;
          widget.updateValue();
          widget.isDirty = false;
          widget.isTranslating = translationControllers.size > 0;
          widget.translationFailed = false;
          translationManager.unregister(widget.id);
        }
        return;
      }

      widget.isTranslating = true;
      widget.translationFailed = false;
      const model =
        layout.getTranslateModel(widget.id) || appState.optionState.get('ComfyGrid.ollama.model');
      const system =
        layout.getTranslateSystem(widget.id) || appState.optionState.get('ComfyGrid.ollama.system');

      if (!model) {
        console.warn('Ollama model not specified.');
        if (currentReqId === translationRequestId) {
          widget.value = text;
          notifyTranslationError({ code: 'missing_model' });
          failTranslation();
        }
        return;
      }

      const controller = new AbortController();
      translationControllers.add(controller);
      try {
        const res = await comfyGridApiClient.translate(
          model,
          text,
          system,
          controller.signal,
          translateSeedMode,
        );
        if (currentReqId !== translationRequestId) {
          return;
        }

        const translated = res.json?.translated_text;
        const succeeded = res.ok && typeof translated === 'string' && translated.trim() !== '';
        if (succeeded) {
          widget.value = translated;
          widget.updateRawValue({ rawValue: text });
          widget.isDirty = false;
        }
        widget.translationFailed = !succeeded;
        if (!succeeded) {
          widget.isDirty = true;
          notifyTranslationError(
            res.json?.detail ?? (res.ok ? { code: 'empty' } : undefined),
            res.status,
            model,
          );
        }
      } catch (error) {
        if (currentReqId === translationRequestId) {
          widget.translationFailed = true;
          widget.isDirty = true;
          notifyTranslationError(error, undefined, model);
        }
      } finally {
        if (translationControllers.delete(controller)) {
          widget.isTranslating = translationControllers.size > 0;
        }
        if (currentReqId === translationRequestId) {
          if (widget.translationFailed) failTranslation();
          widget.updateValue();
          saveLayoutObject(layout);
          registerOrUnregisterPending();
        }
      }
    };

    const promise = execute().finally(() => {
      if (activeTranslationPromise === promise) {
        activeTranslationPromise = null;
        activeTranslationText = '';
      }
    });
    activeTranslationPromise = promise;
    translationManager.trackPromise(promise);

    return promise;
  }

  function registerOrUnregisterPending(retryFailed = false) {
    const timing = appState.optionState.get('ComfyGrid.ollama.translate_timing') ?? 'on_generate';
    const text = getRawInputValue();
    const translatedInput = widget.node.comfyNode.properties.rawValues?.[widget.index];
    if (isTranslate && text.trim() !== '' && translatedInput !== text) {
      widget.isDirty = true;
    }
    if (retryFailed && isTranslate) widget.translationFailed = false;
    if (
      isTranslate &&
      timing !== 'manual' &&
      widget.isDirty &&
      !widget.translationFailed &&
      text.trim() !== ''
    ) {
      translationManager.register(widget.id, () => triggerTranslation(text));
    } else {
      translationManager.unregister(widget.id);
    }
  }

  function invalidateActiveTranslation() {
    translationRequestId++;
    widget.isTranslating = translationControllers.size > 0;
    widget.translationFailed = false;
  }

  function cancelTranslation() {
    invalidateActiveTranslation();
    for (const controller of translationControllers) {
      controller.abort();
    }
    translationControllers.clear();
    activeTranslationPromise = null;
    activeTranslationText = '';
    activeTranslationRequestId = 0;
    widget.isTranslating = false;
    if (inputTimer) {
      clearTimeout(inputTimer);
      inputTimer = null;
    }
    translationManager.unregister(widget.id);
  }

  function failTranslation() {
    translationManager.cancelAll();
    widget.translationFailed = true;
    widget.isDirty = true;
  }

  $effect(() =>
    translationManager.registerCancellation(widget.id, cancelTranslation, () =>
      registerOrUnregisterPending(true),
    ),
  );

  function handleManualTranslate() {
    const text = getRawInputValue();
    if (text.trim()) {
      widget.isDirty = true;
      triggerTranslation(text);
    }
  }

  function handleInput() {
    invalidateActiveTranslation();
    widget.isDirty = true;
    if (isTranslate) {
      if (!widget.rawValue?.trim()) {
        widget.value = widget.rawValue ?? '';
        widget.updateValue();
      }
      registerOrUnregisterPending();
    } else {
      widget.invalidateTranslation();
      widget.updateValue();
    }
  }

  function handleBlur() {
    const timing = appState.optionState.get('ComfyGrid.ollama.translate_timing') ?? 'on_generate';
    const text = widget.rawValue ?? '';
    if (isTranslate && timing === 'on_blur' && widget.isDirty) {
      triggerTranslation(text);
    }
  }

  $effect(() => {
    const currentWidget = widget;
    if (isTranslate) untrack(() => currentWidget.initializeRawValue());
  });

  $effect(() => {
    if (isTranslate) {
      registerOrUnregisterPending();
    } else {
      widget.translationFailed = false;
      translationManager.unregister(widget.id);
    }
  });

  let previousOllamaConfig: string | null = null;
  let previousOllamaWidget: ComfyGridWidget | null = null;
  const currentOllamaConfig = $derived(
    `${layout.getTranslateModel(widget.id) ?? appState.optionState.get('ComfyGrid.ollama.model') ?? ''}::${layout.getTranslateSystem(widget.id) ?? appState.optionState.get('ComfyGrid.ollama.system') ?? ''}::${translateSeedMode}`,
  );

  $effect(() => {
    const config = currentOllamaConfig;
    const currentWidget = widget;
    untrack(() => {
      if (previousOllamaWidget && previousOllamaWidget !== currentWidget) {
        cancelTranslation();
      }
      if (
        previousOllamaWidget === currentWidget &&
        previousOllamaConfig !== null &&
        previousOllamaConfig !== config
      ) {
        invalidateActiveTranslation();
        widget.isDirty = true;
        const text = widget.rawValue ?? '';
        if (isTranslate && text.trim()) {
          const timing =
            appState.optionState.get('ComfyGrid.ollama.translate_timing') ?? 'on_generate';
          if (timing === 'on_generate') {
            registerOrUnregisterPending(true);
          } else {
            triggerTranslation(text);
          }
        }
      }
      previousOllamaConfig = config;
      previousOllamaWidget = currentWidget;
    });
  });

  onDestroy(() => {
    if (inputTimer) clearTimeout(inputTimer);
    translationManager.unregister(widget.id);
  });

  async function moveToBoard(boardId: BoardId) {
    layout.setFloatingWidgets(widget.id, boardId);
    if (boardId === 'Tab') activateTabForNode(widget.node.id, boardId);
    await updateBoardFloatingState(widget.id);
  }

  $effect(() => {
    widget.textarea = textareaElement;
    widget.triggerTranslation = (t?: string) => {
      const text = t ?? getRawInputValue();
      widget.isDirty = true;
      return triggerTranslation(text);
    };
  });
</script>

{#snippet textarea()}
  {#if layout.isJsonWidget(widget.id)}
    <JsonEditor
      bind:value={widget.value}
      readonly={widget.readonly}
      placeholder={widget.placeholder}
      oninput={handleInput}
      onblur={handleBlur}
    />
  {:else if isTranslate && useOllamaCodeMirror}
    <PromptEditor
      rows={options.isFloating ? 1 : 6}
      readonly={widget.readonly}
      placeholder={widget.placeholder}
      bind:value={getRawInputValue, setRawInputValue}
      enablePromptPilot={false}
      oninput={handleInput}
      onblur={handleBlur}
    />
  {:else if isPromptGroup}
    <PromptEditor
      rows={options.isFloating ? 1 : 6}
      readonly={widget.readonly}
      placeholder={widget.placeholder}
      bind:value={widget.value}
      oninput={handleInput}
      onblur={handleBlur}
    />
  {:else if isTranslate}
    <textarea
      class="flex-grow-1 form-control overflow-y-scroll rounded-top-0"
      class:positive-prompt={isPositivePrompt}
      class:prompt={isPromptGroup}
      oninput={handleInput}
      onblur={handleBlur}
      rows={options.isFloating ? 1 : 6}
      style:min-height={options.isFloating ? '0' : undefined}
      readonly={widget.readonly}
      placeholder={widget.placeholder}
      bind:value={getRawInputValue, setRawInputValue}
      bind:this={textareaElement}></textarea>
  {:else}
    <textarea
      class="flex-grow-1 form-control overflow-y-scroll rounded-top-0"
      class:positive-prompt={isPositivePrompt}
      class:prompt={isPromptGroup}
      oninput={handleInput}
      rows={options.isFloating ? 1 : 6}
      style:min-height={options.isFloating ? '0' : undefined}
      readonly={widget.readonly}
      placeholder={widget.placeholder}
      bind:value={widget.value}
      bind:this={textareaElement}></textarea>
  {/if}
{/snippet}

{#if !layout.floatingWidgets.get(widget.id) && !options.isTextareaOnly}
  <div
    class="d-flex flex-grow-1"
    title={widget.tooltip ?? ''}
    data-id={widget.id}
    data-name={widget.name}
  >
    <div class="vstack h-100 flex-grow-1 rounded textarea-container">
      <AppMenu context items={layoutMenuItems}>
        {#snippet trigger({ props })}
          <div
            {...props}
            class="d-flex border rounded-top border-bottom-0 bg-light d-flex py-0 ps-3 pe-0 align-items-center"
          >
            <TextareaCategory {widget} onManualTranslate={handleManualTranslate} />
            <div class="ms-auto">
              <GridStackMoveButton items={layoutMenuItems} />
            </div>
          </div>
        {/snippet}
      </AppMenu>
      <div class="d-flex flex-grow-1 overflow-y-hidden">
        {@render textarea()}
      </div>
    </div>
  </div>
{:else}
  {@render textarea()}
{/if}

<style lang="scss">
  textarea[readonly] {
    background-color: var(--bs-secondary-bg);
  }
  textarea:focus {
    border: var(--bs-border-width) solid var(--bs-border-color);
  }
  .textarea-container {
    transition:
      border-color 0.15s ease-in-out,
      box-shadow 0.15s ease-in-out;
    &:has(textarea:focus) {
      box-shadow: 0 0 0 var(--bs-focus-ring-width) var(--bs-focus-ring-color);
    }
  }
  :global(.node-widget:not(:has(.textarea-container))) {
    transition:
      border-color 0.15s ease-in-out,
      box-shadow 0.15s ease-in-out;
    &:has(textarea:focus) {
      border-color: var(--bs-border-color) !important;
      box-shadow: 0 0 0 var(--bs-focus-ring-width) var(--bs-focus-ring-color) !important;
    }
  }
</style>
