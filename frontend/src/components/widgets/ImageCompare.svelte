<script lang="ts">
  let {
    src1,
    alt1 = '',
    src2,
    alt2 = '',
    value = $bindable(50),
    class: className = '',
    maxHeight = undefined,
    maxWidth = undefined,
    resetOnLeave = false,
  }: {
    src1: string;
    alt1?: string;
    src2: string;
    alt2?: string;
    value?: number;
    hover?: boolean;
    class?: string;
    maxHeight?: number;
    maxWidth?: number;
    resetOnLeave?: boolean;
  } = $props();

  let container = $state<HTMLDivElement>();

  function updatePosition(clientX: number) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    value = (x / rect.width) * 100;
  }

  function handleMouseMove(e: MouseEvent) {
    updatePosition(e.clientX);
  }

  function handleTouchMove(e: TouchEvent) {
    updatePosition(e.touches[0].clientX);
  }

  function handleLeave() {
    if (resetOnLeave) {
      value = 0;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="image-compare {className}"
  bind:this={container}
  onmousemove={handleMouseMove}
  onmouseleave={handleLeave}
  ontouchend={handleLeave}
  ontouchcancel={handleLeave}
  ontouchmove={handleTouchMove}
>
  <!-- Base Image (Background) -->
  <img
    src={src1}
    alt={alt1}
    class="img-base"
    draggable="false"
    style:max-height={maxHeight ? `${maxHeight}px` : 'none'}
    style:max-width={maxWidth ? `${maxWidth}px` : 'none'}
  />

  <!-- Overlay Image (Foreground, clipped) -->
  <img
    src={src2}
    alt={alt2}
    class="img-overlay"
    draggable="false"
    style:clip-path="inset(0 {100 - value}% 0 0)"
    style:max-height={maxHeight ? `${maxHeight}px` : 'none'}
    style:max-width={maxWidth ? `${maxWidth}px` : 'none'}
  />

  <!-- Divider Line -->
  <div class="divider" style:left="{value}%" style:display={value > 0 ? 'block' : 'none'}></div>
</div>

<style>
  .image-compare {
    position: relative;
    display: inline-block;
    overflow: hidden;
    width: 100%;
    user-select: none;
    cursor: col-resize;
    line-height: 0;
  }

  .img-base {
    display: block;
    width: 100%;
    height: auto;
    object-fit: contain;
  }

  .img-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  .divider {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(0, 0, 0, 0.5);
    pointer-events: none;
    transform: translateX(-50%);
  }
</style>
