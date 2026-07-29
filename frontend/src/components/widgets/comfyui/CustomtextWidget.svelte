<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { comfyGridApiClient } from '@/api/api-client';
  import { t } from '@/i18n/i18n';
  import { saveLayoutObject, updateBoardFloatingState } from '@/services/gridstack-service';
  import { translationManager } from '@/services/translation-service';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';
  import { keyupEditAttention } from '../../../helpers/edit-attention';
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
  const isPromptGroup = $derived(isPrompt || isPositivePrompt || isNegativePrompt);

  let lastTranslatedSourceText = $state<string>('');
  let prevIsTranslate = $state<boolean>(false);
  let inputTimer: ReturnType<typeof setTimeout> | null = null;
  let translationRequestId = 0;

  const floatingButtonTitle = $derived(
    layout.floatingWidgets.get(widget.id) ? 'node.move_to_group.title' : 'node.move_to_grid.title',
  );

  async function triggerTranslation(text: string) {
    const currentReqId = ++translationRequestId;

    if (!text.trim()) {
      if (currentReqId === translationRequestId) {
        widget.value = text;
        widget.updateComfyUiValue();
        lastTranslatedSourceText = text;
        widget.isTranslating = false;
        translationManager.unregister(widget.id);
      }
      return;
    }

    widget.isTranslating = true;
    const model =
      layout.getTranslateModel(widget.id) || appState.optionState.get('ComfyGrid.ollama.model');
    const system =
      layout.getTranslateSystem(widget.id) || appState.optionState.get('ComfyGrid.ollama.system');

    if (!model) {
      console.warn('Ollama model not specified.');
      if (currentReqId === translationRequestId) {
        widget.value = text;
        widget.isTranslating = false;
        translationManager.unregister(widget.id);
      }
      return;
    }

    try {
      const res = await comfyGridApiClient.translate(model, text, system);
      if (currentReqId !== translationRequestId) {
        return;
      }

      if (res.ok && res.json?.translated_text) {
        widget.value = res.json.translated_text;
      } else {
        widget.value = text;
      }
      lastTranslatedSourceText = text;
    } catch {
      if (currentReqId === translationRequestId) {
        widget.value = text;
      }
    } finally {
      if (currentReqId === translationRequestId) {
        widget.updateComfyUiValue();
        widget.isTranslating = false;
        saveLayoutObject(layout);
        registerOrUnregisterPending();
      }
    }
  }

  function registerOrUnregisterPending() {
    const text = widget.rawValue ?? '';
    if (isTranslate && text.trim() !== '' && text !== lastTranslatedSourceText) {
      translationManager.register(widget.id, () => triggerTranslation(text));
    } else {
      translationManager.unregister(widget.id);
    }
  }

  function handleInput() {
    if (isTranslate) {
      registerOrUnregisterPending();
      const timing = appState.optionState.get('ComfyGrid.ollama.translate_timing') ?? 'on_blur';
      if (timing === 'after_input') {
        if (inputTimer) clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
          const text = widget.rawValue ?? '';
          if (text !== lastTranslatedSourceText) {
            triggerTranslation(text);
          }
        }, 1000);
      }
    } else {
      widget.updateComfyUiValue();
    }
  }

  function handleBlur() {
    const timing = appState.optionState.get('ComfyGrid.ollama.translate_timing') ?? 'on_blur';
    const text = widget.rawValue ?? '';
    if (isTranslate && timing === 'on_blur' && text !== lastTranslatedSourceText) {
      triggerTranslation(text);
    }
  }

  $effect(() => {
    const currentIsTranslate = isTranslate;
    if (currentIsTranslate !== prevIsTranslate) {
      prevIsTranslate = currentIsTranslate;
      if (currentIsTranslate) {
        if (widget.rawValue === undefined || widget.rawValue === null) {
          widget.rawValue = widget.value ?? '';
        }
        registerOrUnregisterPending();
        const timing = appState.optionState.get('ComfyGrid.ollama.translate_timing') ?? 'on_blur';
        const text = widget.rawValue ?? '';
        if (timing !== 'on_generate' && text.trim() && text !== lastTranslatedSourceText) {
          triggerTranslation(text);
        }
      } else {
        if (widget.rawValue !== undefined && widget.rawValue === widget.value) {
          widget.rawValue = undefined;
        }
        translationManager.unregister(widget.id);
      }
    }
  });

  const currentOllamaConfig = $derived(
    `${layout.getTranslateModel(widget.id) ?? appState.optionState.get('ComfyGrid.ollama.model') ?? ''}::${layout.getTranslateSystem(widget.id) ?? appState.optionState.get('ComfyGrid.ollama.system') ?? ''}`,
  );
  let prevOllamaConfig = $state<string>(untrack(() => currentOllamaConfig));

  $effect(() => {
    const config = currentOllamaConfig;
    if (prevOllamaConfig && config && config !== prevOllamaConfig) {
      prevOllamaConfig = config;
      const text = widget.rawValue ?? '';
      if (isTranslate && text.trim()) {
        const timing = appState.optionState.get('ComfyGrid.ollama.translate_timing') ?? 'on_blur';
        if (timing === 'on_generate') {
          lastTranslatedSourceText = '';
          registerOrUnregisterPending();
        } else {
          triggerTranslation(text);
        }
      }
    } else {
      prevOllamaConfig = config;
    }
  });

  onDestroy(() => {
    if (inputTimer) clearTimeout(inputTimer);
    translationManager.unregister(widget.id);
  });

  function keydown(e: KeyboardEvent) {
    if (e.ctrlKey) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        keyupEditAttention(e, textareaElement);
        textareaElement.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  async function toggleFloating() {
    const current = layout.floatingWidgets.get(widget.id);
    layout.setFloatingWidgets(widget.id, current ? '' : 'Global');
    await updateBoardFloatingState();
  }

  $effect(() => {
    widget.textarea = textareaElement;
  });
</script>

{#snippet textarea()}
  {#if isTranslate}
    <textarea
      class="flex-grow-1 form-control overflow-y-scroll rounded-top-0"
      class:positive-prompt={isPositivePrompt}
      class:prompt={isPromptGroup}
      onkeydown={keydown}
      oninput={handleInput}
      onblur={handleBlur}
      rows={options.isFloating ? 1 : 6}
      style:min-height={options.isFloating ? '0' : undefined}
      readonly={widget.readonly}
      bind:value={widget.rawValue}
      bind:this={textareaElement}
    ></textarea>
  {:else}
    <textarea
      class="flex-grow-1 form-control overflow-y-scroll rounded-top-0"
      class:positive-prompt={isPositivePrompt}
      class:prompt={isPromptGroup}
      onkeydown={keydown}
      oninput={handleInput}
      rows={options.isFloating ? 1 : 6}
      style:min-height={options.isFloating ? '0' : undefined}
      readonly={widget.readonly}
      bind:value={widget.value}
      bind:this={textareaElement}
    ></textarea>
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
      <div
        class="d-flex border rounded-top border-bottom-0 bg-light d-flex py-0 ps-3 pe-0 align-items-center"
      >
        <TextareaCategory {widget} />
        <button
          class="btn btn-xs ms-auto"
          title={$t(floatingButtonTitle)}
          style="background: var(--background-fill-primary);"
          onclick={toggleFloating}
        >
          <i class="pi pi-objects-column"></i>
        </button>
      </div>
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
