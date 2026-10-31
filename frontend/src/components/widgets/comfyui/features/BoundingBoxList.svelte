<script lang="ts">
  import type { Snippet } from 'svelte';
  import { GripVertical, Plus } from '@lucide/svelte';
  import { t } from '@/i18n/i18n';
  import type { BoundingBox } from './bounding-boxes';

  let {
    boxes,
    selection,
    readonly,
    onselect,
    onreorder,
    onadd,
    onkeyboard,
    children,
  }: {
    boxes: BoundingBox[];
    selection: number[];
    readonly: boolean;
    onselect: (index: number, additive: boolean, range: boolean) => void;
    onreorder: (from: number, to: number) => void;
    onadd: () => void;
    onkeyboard: (event: KeyboardEvent) => void;
    children?: Snippet;
  } = $props();
  let dragging = $state<number | null>(null);
  let target = $state<number | null>(null);
  let source: BoundingBox[] | null = null;
  const rows = $derived(boxes.map((box, index) => ({ box, index })));

  function reset() {
    dragging = null;
    target = null;
    source = null;
  }
</script>

<aside class="bbox-list border rounded-bottom" aria-label={$t('bbox.shapes')}>
  <div class="bbox-list-header bg-light border-bottom">
    <span class="text-truncate">{$t('bbox.shapes')}</span>
    <button
      type="button"
      class="btn btn-xs btn-icon btn-secondary flex-shrink-0"
      title={$t('bbox.add')}
      aria-label={$t('bbox.add')}
      disabled={readonly}
      onclick={onadd}><Plus size={12} /></button
    >
  </div>
  <div class="bbox-list-body">
    <div class="bbox-list-items">
      {#each rows as { box, index } (index)}
        <button
          type="button"
          class="bbox-list-item"
          class:selected={selection.includes(index)}
          class:drop-target={target === index}
          class:dragging={dragging !== null &&
            (dragging === index || (selection.includes(dragging) && selection.includes(index)))}
          data-box-index={index}
          aria-pressed={selection.includes(index)}
          title={(box.metadata.type === 'text' ? box.metadata.text : box.metadata.desc) ||
            $t('bbox.shape')}
          draggable={!readonly}
          disabled={readonly}
          onclick={(event) => onselect(index, event.ctrlKey || event.metaKey, event.shiftKey)}
          ondragstart={(event) => {
            if (readonly || !event.dataTransfer) {
              event.preventDefault();
              return;
            }
            event.stopPropagation();
            dragging = index;
            source = boxes;
            event.dataTransfer.setData('application/x-comfygrid-bbox', String(index));
            event.dataTransfer.effectAllowed = 'move';
          }}
          ondragover={(event) => {
            if (readonly || dragging === null || source !== boxes) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            target = index;
          }}
          ondrop={(event) => {
            if (readonly || dragging === null || source !== boxes) {
              reset();
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onreorder(dragging, index);
            reset();
          }}
          ondragend={reset}
          onkeydown={(event) => {
            if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) {
              onkeyboard(event);
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            const moving = selection.includes(index) ? selection : [index];
            const to = event.key === 'ArrowUp' ? Math.min(...moving) - 1 : Math.max(...moving) + 1;
            onreorder(index, to);
          }}
        >
          <GripVertical size={12} />
          <span class="bbox-list-number">{String(index + 1).padStart(2, '0')}</span>
          <span class="bbox-list-label"
            >{(box.metadata.type === 'text' ? box.metadata.text : box.metadata.desc) ||
              $t('bbox.shape')}</span
          >
        </button>
      {/each}
    </div>
  </div>
  {@render children?.()}
</aside>

<style>
  .bbox-list {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--bs-body-bg);
  }
  .bbox-list-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    height: 1.75rem;
    padding: 0 0.375rem;
    font-size: 0.75rem;
  }
  .bbox-list-body {
    position: relative;
    flex: 1 1 0;
    min-height: 0;
  }
  .bbox-list-items {
    position: absolute;
    inset: 0;
    overflow: auto;
  }
  .bbox-list-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    min-height: 2rem;
    padding: 0.25rem;
    border: 0;
    border-bottom: 1px solid var(--bs-border-color);
    border-radius: 0;
    background: transparent;
    color: var(--bs-body-color);
    text-align: left;
    font-size: 1rem;
  }
  .bbox-list-item:hover {
    background: var(--bs-tertiary-bg);
  }
  .bbox-list-item.selected {
    background: var(--bs-primary-bg-subtle);
    color: var(--bs-primary-text-emphasis);
  }
  .bbox-list-item:focus-visible {
    outline: 2px solid var(--bs-primary);
    outline-offset: -2px;
  }
  .bbox-list-item.drop-target {
    box-shadow: inset 0 0 0 2px var(--bs-primary);
  }
  .bbox-list-item.dragging {
    opacity: 0.5;
  }
  .bbox-list-item > :global(svg),
  .bbox-list-number {
    flex-shrink: 0;
  }
  .bbox-list-number {
    font-variant-numeric: tabular-nums;
  }
  .bbox-list-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global([data-bs-theme='dark']) .bbox-list-header {
    background-color: var(--bs-tertiary-bg) !important;
  }
</style>
