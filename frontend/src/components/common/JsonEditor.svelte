<script lang="ts">
  import { onMount } from 'svelte';
  import { json, jsonParseLinter } from '@codemirror/lang-json';
  import { linter } from '@codemirror/lint';
  import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
  import { EditorView, placeholder as cmPlaceholder } from '@codemirror/view';
  import { basicSetup } from 'codemirror';
  import { appState } from '@/states/app-state.svelte';
  import {
    promptHighlightPlugin,
    reconfigureHighlightEffect,
  } from './prompt-editor/prompt-highlighter';
  import './prompt-editor/prompt-highlighter.scss';
  import { promptPilotCompletion } from './prompt-editor/prompt-pilot';
  import { ensurePromptPilotModelsLoaded } from './prompt-editor/prompt-pilot/services/loader-service';
  import { segmentHighlighter } from './prompt-editor/segment-highlighter';

  let {
    value = $bindable(''),
    readonly = false,
    placeholder = '',
    enablePromptPilot = false,
    oninput,
    onblur,
  }: {
    value?: string;
    readonly?: boolean;
    placeholder?: string;
    enablePromptPilot?: boolean;
    oninput?: (event: Event) => void;
    onblur?: (event: FocusEvent) => void;
  } = $props();

  let container: HTMLDivElement;
  let view = $state<EditorView>();
  let error = $state('');
  let applyingExternal = false;
  const configuration = new Compartment();
  const completionCompartment = new Compartment();
  const highlightCompartment = new Compartment();

  function validate(text: string) {
    try {
      JSON.parse(text);
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  function formatted(text: string): string {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }

  // Ignore formatting whitespace, but retain spaces inside JSON strings.
  function significantOffsets(text: string): number[] {
    const offsets: number[] = [];
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted || !/\s/.test(char)) offsets.push(i);
      if (quoted && escaped) escaped = false;
      else if (quoted && char === '\\') escaped = true;
      else if (char === '"') quoted = !quoted;
    }
    return offsets;
  }

  onMount(() => {
    const editor = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: formatted(value ?? ''),
        extensions: [
          basicSetup,
          completionCompartment.of(enablePromptPilot ? promptPilotCompletion() : []),
          EditorState.transactionFilter.of((transaction) => {
            if (!transaction.docChanged) return transaction;
            const text = transaction.newDoc.toString();
            const next = formatted(text);
            if (next === text) return transaction;
            const before = significantOffsets(text);
            const after = significantOffsets(next);
            const map = (position: number) => {
              if (position === 0) return 0;
              if (position === text.length) return next.length;
              const index = before.findIndex((offset) => offset >= position);
              return index < 0 ? next.length : after[index];
            };
            return [
              transaction,
              {
                changes: { from: 0, to: text.length, insert: next },
                selection: EditorSelection.create(
                  transaction.newSelection.ranges.map((range) =>
                    EditorSelection.range(map(range.anchor), map(range.head)),
                  ),
                  transaction.newSelection.mainIndex,
                ),
                sequential: true,
              },
            ];
          }),
          json(),
          highlightCompartment.of(enablePromptPilot ? promptHighlightPlugin : segmentHighlighter),
          linter(jsonParseLinter()),
          EditorView.lineWrapping,
          configuration.of([
            EditorState.readOnly.of(readonly),
            EditorView.editable.of(!readonly),
            cmPlaceholder(placeholder),
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const next = update.state.doc.toString();
            validate(next);
            if (value !== next) {
              value = next;
              if (!applyingExternal) oninput?.(new Event('input'));
            }
          }),
          EditorView.domEventHandlers({
            blur: (event) => {
              onblur?.(event);
            },
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              color: 'var(--bs-body-color)',
              backgroundColor: 'var(--bs-body-bg)',
            },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--bs-font-monospace)' },
            '.cm-content': { minHeight: '144px' },
            '.cm-gutters': {
              backgroundColor: 'var(--bs-tertiary-bg)',
              color: 'var(--bs-secondary-color)',
              borderColor: 'var(--bs-border-color)',
            },
            '.cm-cursor': { borderLeftColor: 'var(--bs-body-color)' },
          }),
        ],
      }),
    });
    view = editor;
    validate(editor.state.doc.toString());
    return () => {
      view = undefined;
      editor.destroy();
    };
  });

  $effect(() => {
    view?.dispatch({
      effects: completionCompartment.reconfigure(enablePromptPilot ? promptPilotCompletion() : []),
    });
  });
  $effect(() => {
    view?.dispatch({
      effects: highlightCompartment.reconfigure(
        enablePromptPilot ? promptHighlightPlugin : segmentHighlighter,
      ),
    });
  });
  $effect(() => {
    if (!enablePromptPilot) return;
    const coloring = appState.optionState.get('ComfyGrid.prompt_pilot.word_coloring');
    appState.optionState.get('ComfyGrid.prompt_pilot.post_count_threshold');
    appState.optionState.get('ComfyGrid.prompt_pilot.tag_source');
    if (!view) return;
    view.dispatch({ effects: reconfigureHighlightEffect.of() });
    if (coloring === 'category') {
      ensurePromptPilotModelsLoaded().then((loaded) => {
        if (loaded && view && enablePromptPilot)
          view.dispatch({ effects: reconfigureHighlightEffect.of() });
      });
    }
  });
  $effect(() => {
    const text = value ?? '';
    if (view && view.state.doc.toString() !== formatted(text)) {
      applyingExternal = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      } finally {
        applyingExternal = false;
      }
    }
  });
  $effect(() => {
    view?.dispatch({
      effects: configuration.reconfigure([
        EditorState.readOnly.of(readonly),
        EditorView.editable.of(!readonly),
        cmPlaceholder(placeholder),
      ]),
    });
  });
</script>

<div class="json-editor border rounded d-flex flex-column flex-grow-1 overflow-hidden">
  <div class="editor-host flex-grow-1" bind:this={container}></div>
  {#if error}<div class="json-error small text-danger border-top px-2 py-1" role="status">
      {error}
    </div>{/if}
</div>

<style>
  .json-editor {
    --prompt-word-l: 0.25;
    --prompt-word-c: 0.4;
    --prompt-bracket-color: rgba(185, 28, 28, 0.9);
    --prompt-weight-color: rgba(29, 78, 216, 0.9);
    min-width: 0;
    width: 100%;
    align-items: stretch !important;
    justify-content: flex-start !important;
    text-align: left;
  }
  :global([data-bs-theme='dark']) .json-editor {
    --prompt-word-l: 0.78;
    --prompt-word-c: 0.22;
    --prompt-bracket-color: #f87171;
    --prompt-weight-color: #60a5fa;
  }
  .editor-host {
    min-height: 0;
    overflow: auto;
    width: 100%;
    align-self: stretch;
  }
  .editor-host :global(.cm-editor) {
    width: 100%;
  }
  .editor-host :global(.cm-focused) {
    outline: none;
  }
  .json-error {
    overflow-wrap: anywhere;
  }
</style>
