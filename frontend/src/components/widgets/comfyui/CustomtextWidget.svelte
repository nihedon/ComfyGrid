<script lang="ts">
  import { t } from '@/i18n/i18n';
  import { updateBoardFloatingState } from '@/services/gridstack-service';
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
  const isPromptGroup = $derived(isPrompt || isPositivePrompt || isNegativePrompt);

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

  $effect(() => {
    widget.textarea = textareaElement;
  });
</script>

{#snippet textarea()}
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
{/snippet}

{#if !layout.floatingWidgets.get(widget.id) && !options.isTextareaOnly}
  <div
    class="d-flex flex-grow-1"
    title={widget.tooltip ?? ''}
    data-id={widget.id}
    data-name={widget.name}
  >
    <div class="vstack h-100 flex-grow-1 rounded textarea-container">
      <div class="d-flex border rounded-top border-bottom-0 bg-light d-flex py-0 ps-3 pe-0">
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
