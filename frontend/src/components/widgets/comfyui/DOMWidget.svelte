<script lang="ts">
  import { untrack } from 'svelte';
  import { copyWidgetStyles, mountVueWidget } from '@/services/vue-widget-dom-service';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let {
    widget,
    options,
  }: { widget: ComfyGridWidget; options?: { isFloating?: boolean; fitDomToNode?: boolean } } =
    $props();

  const uiState = $derived(appState.uiState);
  const isViewport = $derived(['cameraAngle', 'load3D', 'load3DAdvanced'].includes(widget.type));
  // Parent lists may refresh the prop while its actual DOM identity is unchanged.
  const widgetElement = $derived(widget.element);
  const nativeNode = $derived(widget.node.comfyNode);
  const nativeWidget = $derived(widget.comfyWidget);
  const useVueWidget = $derived(widget.type === 'boundingboxes' || isViewport);

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
    if (!widgetElement && useVueWidget) {
      if (api) {
        const target = shadowRoot;
        const node = nativeNode;
        const sourceWidget = nativeWidget;
        // Reads performed while discovering/moving the DOM must not become placement dependencies.
        return untrack(() => mountVueWidget(target, source, api, node, sourceWidget));
      }
      return;
    }
    const element = widgetElement;
    if (!element) return;
    const target = shadowRoot;
    return untrack(() => {
      copyWidgetStyles(source, target);
      const placeholder = source.createComment('comfygrid-dom-widget');
      element.before(placeholder);
      target.append(element);
      const removeBridge = bridgeDragEvents();
      return () => {
        removeBridge();
        if (placeholder.isConnected) placeholder.replaceWith(element);
        else element.remove();
        placeholder.remove();
      };
    });
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
  class:fit-node={Boolean(options?.isFloating && options?.fitDomToNode)}
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
  .dom-container.fit-node {
    flex: 1 1 0;
    align-self: stretch;
    width: 100%;
    height: 100%;
    min-height: 0;
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
  }
</style>
