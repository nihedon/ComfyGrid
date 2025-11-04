<script lang="ts">
  import type { Snippet } from 'svelte';
  import Split from 'split.js';

  let {
    sizes = [50, 50],
    minSize = 100,
    gutterSize = 4,
    direction = 'horizontal',
    class: className = '',
    children,
  }: {
    sizes?: number[];
    minSize?: number | number[];
    gutterSize?: number;
    direction?: 'horizontal' | 'vertical';
    class?: string;
    children: Snippet;
  } = $props();

  let containerRef: HTMLElement;
  let splitInstance: Split.Instance | null = null;

  $effect(() => {
    if (!containerRef) return;

    if (splitInstance) {
      splitInstance.destroy();
    }

    const elements = Array.from(containerRef.children) as HTMLElement[];

    // Filter out gutter elements in case they remain (just in case)
    const targets = elements.filter((el) => !el.classList.contains('gutter'));

    if (targets.length > 0) {
      splitInstance = Split(targets, {
        sizes,
        minSize,
        gutterSize,
        direction,
        cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
        gutterStyle: (_dim, size) => ({
          'flex-basis': `${size}px`, // if flexbox is used, set flex-basis
        }),
      });
    }

    return () => {
      splitInstance?.destroy();
      splitInstance = null;
    };
  });
</script>

<div
  bind:this={containerRef}
  class="d-flex w-100 {direction === 'vertical' ? 'flex-column' : ''} {className}"
>
  {@render children()}
</div>

<style>
  /* Define the appearance of the gutter as a global style */
  :global(.gutter) {
    background-repeat: no-repeat;
    background-position: 50%;
    flex-shrink: 0; /* Prevent the gutter from collapsing */
  }

  :global(.gutter.gutter-horizontal) {
    cursor: col-resize;
    background-color: var(--bs-light);
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAeCAYAAADkftS9AAAAIklEQVQoU2M4c+bMfxAGAgYYmwGrIIiDjrELjpo5aiZeMwF+yNnOs5KSvgAAAABJRU5ErkJggg==');
  }

  :global(.gutter.gutter-vertical) {
    cursor: row-resize;
    background-color: var(--bs-light);
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAFAQMAAABo7865AAAABlBMVEVHcEzMzMzyAv2sAAAAAXRSTlMAQObYZgAAABBJREFUeF5jOAMEEAIEEFwAn3kMwcB6I2AAAAAASUVORK5CYII=');
  }
</style>
