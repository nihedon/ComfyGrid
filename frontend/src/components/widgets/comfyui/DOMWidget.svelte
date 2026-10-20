<script lang="ts">
  import { copyWidgetStyles, mountVueWidget } from '@/services/vue-widget-dom-service';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget } = $props();

  const uiState = $derived(appState.uiState);
  const isViewport = $derived(['cameraAngle', 'load3D', 'load3DAdvanced'].includes(widget.type));

  let shadowRoot = $state.raw<ShadowRoot | null>(null);

  function bridgeDragEvents(): () => void {
    const iframeWin = appState.comfyUiState.window;
    if (!iframeWin) return () => {};

    const iframeDoc = iframeWin.document;

    const DRAG_EVENTS = ['mousemove', 'mouseup', 'pointermove', 'pointerup'] as const;

    function forward(e: MouseEvent | PointerEvent) {
      const cloned = new (e instanceof PointerEvent ? PointerEvent : MouseEvent)(e.type, {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        movementX: e instanceof MouseEvent ? e.movementX : 0,
        movementY: e instanceof MouseEvent ? e.movementY : 0,
        buttons: e.buttons,
        button: e.button,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        ...(e instanceof PointerEvent
          ? {
              pointerId: e.pointerId,
              pressure: e.pressure,
              pointerType: e.pointerType,
              isPrimary: e.isPrimary,
            }
          : {}),
      });
      iframeDoc.dispatchEvent(cloned);
    }

    DRAG_EVENTS.forEach((type) => {
      document.addEventListener(type, forward, { capture: true });
    });

    return () => {
      DRAG_EVENTS.forEach((type) => {
        document.removeEventListener(type, forward, { capture: true });
      });
    };
  }

  $effect(() => {
    const source = appState.comfyUiState.window?.document;
    const api = appState.comfyUiState.app?.comfyGridDomWidgets;
    if (!shadowRoot || !source || uiState.activePageId !== 'grid') return;
    if (!widget.element && (widget.type === 'boundingboxes' || isViewport)) {
      if (api)
        return mountVueWidget(shadowRoot, source, api, widget.node.comfyNode, widget.comfyWidget);
      return;
    }
    const element = widget.element;
    if (!element) return;
    copyWidgetStyles(source, shadowRoot);
    const placeholder = source.createComment('comfygrid-dom-widget');
    element.before(placeholder);
    shadowRoot.append(element);
    const removeBridge = bridgeDragEvents();
    return () => {
      removeBridge();
      if (placeholder.isConnected) placeholder.replaceWith(element);
      else element.remove();
      placeholder.remove();
    };
  });

  function domMount(nodeElement: HTMLDivElement) {
    shadowRoot = nodeElement.attachShadow({ mode: 'open' });

    return {
      destroy() {
        shadowRoot = null;
      },
    };
  }
</script>

<div
  class="dom-container"
  class:viewport={isViewport}
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
  use:domMount
></div>

<style lang="scss">
  .dom-container {
    display: block;
    min-width: 0;
  }
  .dom-container.viewport {
    display: flex;
    /* Keep percentage heights resolvable inside auto-height flex layouts. */
    flex: 1 1 300px;
    height: 300px;
    min-height: 300px;
  }
</style>
