<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '@/i18n/i18n';
  import { callLayoutChangedCallbacks } from '@/services/callback-service';
  import { saveLayoutObject, updateBoardFloatingState } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';
  import { keyupEditAttention } from '../../../helpers/edit-attention';

  let { widget, isFloating }: { widget: ComfyGridWidget; isFloating: boolean } = $props();

  const workspaceState = appState.workspaceState;

  let textareaElement = $state<HTMLTextAreaElement>()!;

  const layout = $derived(workspaceState.layout);

  const isPrompt = $derived(layout.isPromptWidget(widget.id));
  const isPositivePrompt = $derived(layout.positivePromptWidgetId === widget.id);
  const isNegativePrompt = $derived(layout.negativePromptWidgetId === widget.id);
  const isPromptGroup = $derived(isPrompt || isPositivePrompt || isNegativePrompt);

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

  const floatingButtonTitle = $derived(
    layout.floatingWidgets.get(widget.id) ? 'node.move_to_group.title' : 'node.move_to_grid.title',
  );

  function handleInput() {
    widget.updateComfyUiValue();
  }

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
    layout.setNegativePromptWidgetId(widget.id);
    saveLayoutObject(layout);
    tick().then(() => {
      callLayoutChangedCallbacks();
    });
  }

  onMount(() => {
    widget.textarea = textareaElement;
  });
</script>

<div class="d-flex flex-grow-1 {widget.name}" title={widget.tooltip ?? ''}>
  <div class="vstack h-100 flex-grow-1 rounded textarea-container">
    <div class="d-flex border rounded-top border-bottom-0 bg-light d-flex py-0 ps-3 pe-0">
      <div class="dropdown">
        <!-- svelte-ignore a11y_missing_attribute -->
        <a class="nav-link dropdown-toggle text-capitalize" role="button" data-bs-toggle="dropdown">
          {textCategoryLabel}
        </a>
        <ul class="dropdown-menu">
          <li>
            <button class="dropdown-item" onclick={changeToText}
              >{$t('widget.select.text.title')}</button
            >
          </li>
          <li>
            <button class="dropdown-item" onclick={changeToPrompt}
              >{$t('widget.select.prompt.title')}</button
            >
          </li>
          <li>
            <button class="dropdown-item" onclick={changeToPositivePrompt}
              >{$t('widget.select.positive_prompt.title')}</button
            >
          </li>
          <li>
            <button class="dropdown-item" onclick={changeToNegativePrompt}
              >{$t('widget.select.negative_prompt.title')}</button
            >
          </li>
        </ul>
      </div>
      {#if widget.node.widgets.length > 1 && !layout.floatingWidgets.get(widget.id)}
        <button
          class="btn btn-xs ms-auto"
          title={$t(floatingButtonTitle)}
          style="background: var(--background-fill-primary);"
          onclick={toggleFloating}
        >
          {#if layout.floatingWidgets.get(widget.id)}
            <i class="pi pi-window-minimize"></i>
          {:else}
            <i class="pi pi-objects-column"></i>
          {/if}
        </button>
      {/if}
    </div>
    <div class="d-flex flex-grow-1 overflow-y-hidden">
      <textarea
        id={widget.id}
        class="flex-grow-1 form-control overflow-y-scroll rounded-top-0"
        class:positive-prompt={isPositivePrompt}
        class:prompt={isPromptGroup}
        data-name={widget.name}
        onkeydown={keydown}
        oninput={handleInput}
        rows={isFloating ? 1 : 6}
        style:min-height={isFloating ? '0' : undefined}
        readonly={widget.readonly}
        bind:value={widget.value}
        bind:this={textareaElement}
      ></textarea>
    </div>
  </div>
</div>

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
</style>
