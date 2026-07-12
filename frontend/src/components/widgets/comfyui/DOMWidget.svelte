<script lang="ts">
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';

  let { widget }: { widget: ComfyGridWidget } = $props();

  const uiState = $derived(appState.uiState);

  let originalParent: HTMLElement | null;
  // eslint-disable-next-line no-undef
  let originalNextSibling: ChildNode | null;

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

  function cloneStyles(doc: HTMLElement | ShadowRoot) {
    try {
      const comfyUiDoc = appState.comfyUiState.window?.document;
      if (!comfyUiDoc) return;

      const styleEl = document.createElement('style');
      doc.appendChild(styleEl);

      const sheets = Array.from(comfyUiDoc.styleSheets || []).flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules || []).map((rule) => rule.cssText);
        } catch {
          return [];
        }
      });
      sheets.push('audio.comfy-audio { height: 40px !important; }');
      sheets.push(':host { --comfy-img-preview-width: 100%; --comfy-img-preview-height: 100%; }');
      styleEl.textContent = sheets.join('\n').replaceAll(':root', ':host');
    } catch (error) {
      console.error('Error cloning styles in DOMWidget:', error);
    }
  }

  function mountElement(element: HTMLElement | ShadowRoot) {
    if (!widget) return;
    if (widget.element.parentElement !== null) {
      originalParent = widget.element.parentElement;
      originalNextSibling = widget.element.nextSibling;
    }

    element.appendChild(widget.element);
  }

  function unmountElement() {
    if (!widget) return;
    if (originalParent) {
      originalParent.insertBefore(widget.element, originalNextSibling);
    } else {
      const iframeDoc = appState.comfyUiState.window?.document;
      const domWidget = iframeDoc?.querySelector('.dom-widget');
      domWidget?.appendChild(widget.element);
    }
  }

  let shadowRoot: ShadowRoot | null = null;

  $effect(() => {
    if (!shadowRoot) return;

    if (uiState.activePageId === 'grid') {
      mountElement(shadowRoot);
      const removeBridge = bridgeDragEvents();
      return () => {
        removeBridge();
      };
    } else if (uiState.activePageId === 'comfyui') {
      unmountElement();
    }
  });

  function domMount(nodeElement: HTMLDivElement) {
    if (!widget) return;

    shadowRoot = nodeElement.attachShadow({ mode: 'open' });
    cloneStyles(shadowRoot);

    return {
      destroy() {
        shadowRoot = null;
        unmountElement();
      },
    };
  }
</script>

<div
  class="dom-container"
  title={widget.tooltip ?? ''}
  data-id={widget.id}
  data-name={widget.name}
  use:domMount
></div>

<style lang="scss">
  .dom-container {
    display: initial !important;
  }
</style>
