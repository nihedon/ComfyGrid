<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import ModelInfoWrapper from './ModelInfoWrapper.svelte';
  import Thumbnail from './Thumbnail.svelte';

  let position = $state({ top: 0, left: 0 });
  let isPositionReady = $state(false);

  const POPOVER_WIDTH = 180;
  const POPOVER_HEIGHT = 240;
  const OFFSET = 10;

  const popoverState = appState.popoverState;

  function updatePosition() {
    if (!popoverState.isVisible()) {
      isPositionReady = false;
      return;
    }
    const rect = popoverState.targetElement!.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.right + OFFSET;
    let top = rect.top;

    // Right edge check - flip to left side if needed
    if (left + POPOVER_WIDTH > viewportWidth) {
      left = rect.left - POPOVER_WIDTH - OFFSET;
    }

    // Left edge check
    if (left < 0) {
      left = OFFSET;
    }

    // Bottom edge check
    if (top + POPOVER_HEIGHT > viewportHeight) {
      top = viewportHeight - POPOVER_HEIGHT - OFFSET;
    }

    // Top edge check
    if (top < 0) {
      top = OFFSET;
    }

    position = { top, left };
    isPositionReady = true;
  }

  $effect(() => {
    if (popoverState.isVisible()) {
      isPositionReady = false;
      updatePosition();
      const animId = requestAnimationFrame(updatePosition);
      return () => cancelAnimationFrame(animId);
    } else {
      isPositionReady = false;
    }
  });

  function handleMouseLeave() {
    popoverState.hidePopover();
  }
</script>

{#if popoverState.visible && popoverState.model && popoverState.modelKey}
  <div
    class="shared-popover"
    style="top: {position.top}px; left: {position.left}px; opacity: {isPositionReady
      ? 1
      : 0}; pointer-events: {isPositionReady ? 'auto' : 'none'};"
    role="tooltip"
    onmouseleave={handleMouseLeave}
  >
    <ModelInfoWrapper model={popoverState.model} showMenuIcons={false}>
      <Thumbnail model={popoverState.model} type={popoverState.modelKey} />
    </ModelInfoWrapper>
  </div>
{/if}

<style lang="scss">
  .shared-popover {
    position: fixed;
    z-index: 1070;
    width: 180px;
    height: calc(180px * 4 / 3);
    background: var(--bs-body-bg);
    border: 1px solid var(--bs-border-color);
    border-radius: 0.375rem;
    box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    transition: opacity 0.1s ease;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }
</style>
