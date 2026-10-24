<script lang="ts" generics="T extends { id: string }">
  import { type Snippet, onMount } from 'svelte';

  let {
    items,
    columnCount,
    children,
  }: {
    items: readonly T[];
    columnCount: number;
    children: Snippet<[T]>;
  } = $props();
  let container: HTMLDivElement;
  const columns = $derived(Math.max(1, Math.floor(columnCount) || 1));
  const columnHeightTolerance = 10;
  // Imperative layout bookkeeping must not trigger Svelte rendering.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const assignments = new Map<string, number>();
  let previousColumns = 0;
  let previousItems = '';
  let observer: ResizeObserver | undefined;
  let frame: number | undefined;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const observed = new Set<HTMLElement>();

  function layout() {
    frame = undefined;
    if (!container?.clientWidth) return;
    const elements = Array.from(container.children) as HTMLElement[];
    const itemKey = JSON.stringify(elements.map((element) => element.dataset.masonryId));
    if (previousColumns !== columns || previousItems !== itemKey) {
      assignments.clear();
      previousColumns = columns;
      previousItems = itemKey;
    }
    const ids = new Set(elements.map((element) => element.dataset.masonryId!));
    for (const id of assignments.keys()) if (!ids.has(id)) assignments.delete(id);
    for (const element of observed) {
      if (!container.contains(element)) {
        observer?.unobserve(element);
        observed.delete(element);
      }
    }
    const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
    const width = (container.clientWidth - gap * (columns - 1)) / columns;
    const heights = Array<number>(columns).fill(0);
    const itemHeights = new Map(
      elements.map((element) => [element, element.getBoundingClientRect().height]),
    );
    for (const element of elements) {
      const id = element.dataset.masonryId!;
      let column = assignments.get(id);
      if (column === undefined) {
        const shortest = Math.min(...heights);
        column = heights.findIndex((height) => height <= shortest + columnHeightTolerance);
        assignments.set(id, column);
      }
      element.style.left = `${column * (width + gap)}px`;
      element.style.top = `${heights[column]}px`;
      heights[column] += itemHeights.get(element)! + gap;
      if (!observed.has(element)) {
        observer?.observe(element);
        observed.add(element);
      }
    }
    container.style.height = `${Math.max(0, ...heights) - (elements.length ? gap : 0)}px`;
  }

  function schedule() {
    if (frame === undefined) frame = requestAnimationFrame(layout);
  }

  $effect(() => {
    void columns;
    // Heights are observed separately: changes must not reset column assignments.
    items.map((item) => item.id);
    schedule();
  });

  onMount(() => {
    observer = new ResizeObserver(schedule);
    observer.observe(container);
    schedule();
    return () => {
      observer?.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  });
</script>

<div class="masonry-grid" bind:this={container} style:--masonry-columns={columns}>
  {#each items as item (item.id)}
    <div class="masonry-item" data-masonry-id={item.id}>
      {@render children(item)}
    </div>
  {/each}
</div>

<style>
  .masonry-grid {
    position: relative;
    min-width: 0;
    column-gap: 0.5rem;
  }
  .masonry-item {
    position: absolute;
    top: 0;
    left: 0;
    min-width: 0;
    display: flow-root;
    width: calc((100% - (var(--masonry-columns) - 1) * 0.5rem) / var(--masonry-columns));
  }
</style>
