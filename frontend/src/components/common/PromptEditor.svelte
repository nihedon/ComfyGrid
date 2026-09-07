<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import {
    highlightSelectionMatches,
    search,
    searchKeymap,
    selectNextOccurrence,
    selectSelectionMatches,
  } from '@codemirror/search';
  import { EditorState } from '@codemirror/state';
  import {
    EditorView,
    placeholder as cmPlaceholder,
    drawSelection,
    keymap,
  } from '@codemirror/view';
  import { appState } from '@/states/app-state.svelte';
  import { bracketMatchingPlugin } from './prompt-editor/bracket-matching';
  import { loraHoverPlugin } from './prompt-editor/lora-hover';
  import { promptAttentionKeymap } from './prompt-editor/prompt-attention';
  import {
    promptHighlightPlugin,
    reconfigureHighlightEffect,
  } from './prompt-editor/prompt-highlighter';
  import { promptPilotCompletion } from './prompt-editor/prompt-pilot';
  import { ensurePromptPilotModelsLoaded } from './prompt-editor/prompt-pilot/services/loader-service';
  import { CustomSearchPanel } from './prompt-editor/search-panel';

  let {
    value = $bindable(''),
    placeholder = '',
    readonly = false,
    rows = 6,
    oninput,
    onblur,
    onkeydown,
  }: {
    value?: string;
    placeholder?: string;
    readonly?: boolean;
    rows?: number;
    oninput?: (e: Event) => void;
    onblur?: (e: FocusEvent) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  } = $props();

  let container = $state<HTMLDivElement>();
  let view = $state<EditorView>();
  let isInternalChange = false;

  const minHeight = $derived(rows === 1 ? '38px' : `${rows * 24}px`);

  onMount(() => {
    if (!container) return;

    const state = EditorState.create({
      doc: value ?? '',
      extensions: [
        history(),
        drawSelection(),
        closeBrackets(),
        search({
          top: true,
          createPanel: (v) => new CustomSearchPanel(v),
        }),
        EditorState.allowMultipleSelections.of(true),
        keymap.of([
          {
            key: 'Ctrl-Enter',
            run: () => true,
          },
          {
            key: 'Mod-Enter',
            run: () => true,
          },
          {
            key: 'Mod-d',
            run: selectNextOccurrence,
            preventDefault: true,
          },
          {
            key: 'Mod-Shift-l',
            run: selectSelectionMatches,
          },
          ...closeBracketsKeymap,
          ...searchKeymap,
          ...promptAttentionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readonly),
        cmPlaceholder(placeholder),
        promptHighlightPlugin,
        bracketMatchingPlugin,
        promptPilotCompletion(),
        loraHoverPlugin(),
        highlightSelectionMatches({
          minSelectionLength: 1,
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        EditorView.updateListener.of((update: any) => {
          if (update.docChanged) {
            isInternalChange = true;
            const newDoc = update.state.doc.toString();
            value = newDoc;
            isInternalChange = false;
            if (oninput) {
              oninput(new Event('input', { bubbles: true }));
            }
          }
        }),
        EditorView.domEventHandlers({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          blur: (event: any) => {
            if (onblur) onblur(event);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          keydown: (event: any) => {
            if (onkeydown) onkeydown(event);
          },
        }),
      ],
    });

    view = new EditorView({
      state,
      parent: container,
    });

    return () => {
      view?.destroy();
    };
  });

  $effect(() => {
    const currentValue = value ?? '';
    if (view && !isInternalChange) {
      untrack(() => {
        const currentDoc = view!.state.doc.toString();
        if (currentDoc !== currentValue) {
          view!.dispatch({
            changes: { from: 0, to: currentDoc.length, insert: currentValue },
          });
        }
      });
    }
  });

  $effect(() => {
    const coloring = appState.optionState.get('ComfyGrid.prompt_pilot.word_coloring');
    appState.optionState.get('ComfyGrid.prompt_pilot.post_count_threshold');
    appState.optionState.get('ComfyGrid.prompt_pilot.tag_source');
    if (view) {
      view.dispatch({
        effects: [reconfigureHighlightEffect.of()],
      });
      if (coloring === 'category') {
        ensurePromptPilotModelsLoaded().then((loaded) => {
          if (loaded && view) {
            view.dispatch({
              effects: [reconfigureHighlightEffect.of()],
            });
          }
        });
      }
    }
  });
</script>

<div
  bind:this={container}
  class="cm-editor-container flex-grow-1 overflow-hidden rounded-top-0 border"
  class:readonly
  style:--cm-min-height={minHeight}
  style:min-height={minHeight}
></div>

<style lang="scss">
  .cm-editor-container {
    background-color: var(--bs-body-bg);
    border-color: var(--bs-border-color);
    position: relative;
    display: flex;
    flex-direction: column;
    --prompt-word-l: 0.25;
    --prompt-word-c: 0.4;
    --prompt-bracket-color: rgba(185, 28, 28, 0.9);
    --prompt-weight-color: rgba(29, 78, 216, 0.9);

    @media (prefers-color-scheme: dark) {
      --prompt-word-l: 0.78;
      --prompt-word-c: 0.22;
      --prompt-bracket-color: #f87171;
      --prompt-weight-color: #60a5fa;
    }

    :global([data-bs-theme='light']) & {
      --prompt-word-l: 0.25;
      --prompt-word-c: 0.4;
      --prompt-bracket-color: rgba(185, 28, 28, 0.9);
      --prompt-weight-color: rgba(29, 78, 216, 0.9);
    }

    :global([data-bs-theme='dark']) & {
      --prompt-word-l: 0.78;
      --prompt-word-c: 0.22;
      --prompt-bracket-color: #f87171;
      --prompt-weight-color: #60a5fa;
    }

    &.readonly {
      background-color: var(--bs-secondary-bg);
    }

    &:focus-within {
      border-color: var(--bs-border-color);
    }

    :global(.cm-editor) {
      width: 100%;
      height: 100%;
      min-height: var(--cm-min-height);
      font-family: var(--bs-font-monospace, monospace);
      background-color: var(--bs-body-bg);
      color: var(--bs-body-color);

      &:global(.cm-focused) {
        outline: none;
      }
    }

    :global(.cm-scroller) {
      overflow: auto;
      font-family: inherit;
    }

    :global(.cm-content) {
      padding: 0.375rem 0.75rem;
      caret-color: var(--bs-body-color);
      min-height: var(--cm-min-height);
    }

    :global(.cm-placeholder) {
      color: var(--bs-secondary-color);
    }

    :global(.cm-matchingBracket) {
      background-color: rgba(var(--bs-primary-rgb, 13, 110, 253), 0.3) !important;
      border-radius: 2px !important;
      font-weight: bold !important;
    }

    :global(.cm-nonmatchingBracket) {
      background-color: rgba(var(--bs-danger-rgb, 220, 53, 69), 0.3) !important;
      outline: 1px solid var(--bs-danger, #dc3545) !important;
      border-radius: 2px !important;
      font-weight: bold !important;
    }

    :global(.cm-cursor),
    :global(.cm-dropCursor) {
      border-left-color: var(--bs-body-color) !important;
    }

    :global(.cm-selectionBackground) {
      background-color: rgba(var(--bs-primary-rgb, 13, 110, 253), 0.25) !important;
    }
  }

  :global(.cm-panels) {
    background-color: var(--bs-body-bg) !important;
    color: var(--bs-body-color) !important;
    border-color: var(--bs-border-color) !important;
  }

  :global(.cm-custom-search-panel input.form-control) {
    font-size: 0.8rem;
  }

  :global(.cm-custom-search-panel .btn-icon:hover) {
    color: var(--bs-body-color) !important;
  }

  :global(.cm-line) {
    padding: 0 !important;
  }

  :global(.cm-prompt-word) {
    color: var(--word-color, inherit) !important;
    font-weight: normal !important;
  }

  :global(.cm-prompt-bracket) {
    color: var(--prompt-bracket-color) !important;
    font-weight: 500 !important;
  }

  :global(.cm-prompt-weight) {
    color: var(--prompt-weight-color) !important;
    font-weight: 500 !important;
  }

  :global(.cm-prompt-comma) {
    color: var(--bs-secondary-color);
    opacity: 0.7;
  }

  :global(.cm-prompt-escape) {
    color: var(--bs-secondary-color);
    opacity: 0.6;
  }

  :global(.cm-prompt-duplicate) {
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
    opacity: 0.5;
  }

  :global(.cm-prompt-error) {
    text-decoration: underline var(--bs-danger, #ef4444) 1.5px !important;
    text-underline-offset: 1px;
    background-color: rgba(239, 68, 68, 0.12);
    border-radius: 2px;
  }

  :global(.cm-prompt-trailing-space) {
    background-color: rgba(128, 128, 128, 0.25) !important;
    display: inline-block;
    border-radius: 2px !important;
  }

  :global(.cm-selectionMatch) {
    background-color: rgba(13, 110, 253, 0.25) !important;
    border-radius: 2px;
  }
</style>
