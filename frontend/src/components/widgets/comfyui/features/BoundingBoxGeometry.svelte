<script lang="ts">
  import { t } from '@/i18n/i18n';
  import type { BoundingBox, BoxGeometryField } from './bounding-boxes';

  let {
    boxes,
    selection,
    readonly,
    width,
    height,
    oncommit,
  }: {
    boxes: BoundingBox[];
    selection: number[];
    readonly: boolean;
    width: number;
    height: number;
    oncommit: (field: BoxGeometryField, value: number) => void;
  } = $props();

  const fields: BoxGeometryField[] = ['x', 'y', 'width', 'height'];
  const selected = $derived(selection.map((index) => boxes[index]).filter(Boolean));
  const values = $derived.by(() =>
    Object.fromEntries(
      fields.map((field) => [
        field,
        selected.length && selected.every((box) => box[field] === selected[0][field])
          ? selected[0][field]
          : '',
      ]),
    ),
  );

  function commit(input: HTMLInputElement, field: BoxGeometryField) {
    if (
      !readonly &&
      selected.length &&
      input.value.trim() &&
      Number.isFinite(input.valueAsNumber)
    ) {
      oncommit(field, input.valueAsNumber);
    }
    // Also restore blank/invalid input and show the actual value after bounds clamping.
    input.value = String(values[field]);
  }
</script>

<div class="bbox-geometry border-top" role="group" aria-label={$t('bbox.geometry')}>
  {#each fields as field (field)}
    <label class="bbox-geometry-field">
      <span class="text-truncate" title={$t(`bbox.${field}`)}>{$t(`bbox.${field}`)}</span>
      <input
        class="form-control form-control-sm"
        type="number"
        step="1"
        min={field === 'width' || field === 'height' ? 1 : 0}
        max={field === 'width' ? width : field === 'height' ? height : undefined}
        aria-label={$t(`bbox.${field}`)}
        value={values[field]}
        placeholder={selected.length > 1 && values[field] === '' ? $t('bbox.mixed') : ''}
        disabled={readonly || !selected.length}
        onchange={(event) => commit(event.currentTarget, field)}
        onkeydown={(event) => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'Escape') event.currentTarget.value = String(values[field]);
          event.currentTarget.blur();
        }}
      />
    </label>
  {/each}
</div>

<style>
  .bbox-geometry {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.25rem;
    padding: 0.375rem;
    flex-shrink: 0;
    max-height: 55%;
    min-height: 0;
    overflow: auto;
  }
  .bbox-geometry-field {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    font-size: 0.6875rem;
  }
  input {
    width: 100%;
    min-width: 0;
    padding: 0.125rem 0.25rem;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
  @container (max-width: 140px) {
    .bbox-geometry {
      grid-template-columns: minmax(0, 1fr);
    }
    .bbox-geometry-field {
      display: grid;
      grid-template-columns: 1.5rem minmax(0, 1fr);
      align-items: center;
      gap: 0.25rem;
    }
  }
</style>
