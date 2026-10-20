import type { ComfyDomWidgetApi, ComfyNode, ComfyWidget } from '@/types/comfy-model';

const borrowedElements = new WeakSet<HTMLElement>();

export function copyWidgetStyles(source: Document, target: ShadowRoot) {
    const css = Array.from(source.styleSheets).flatMap((sheet) => {
        try {
            return Array.from(sheet.cssRules, (rule) => rule.cssText);
        } catch {
            return [];
        }
    });
    css.push('audio.comfy-audio { height: 40px !important; }');
    css.push(':host { --comfy-img-preview-width: 100%; --comfy-img-preview-height: 100%; }');
    let style = target.querySelector<HTMLStyleElement>('style[data-comfygrid-styles]');
    if (!style) {
        style = target.ownerDocument.createElement('style');
        style.dataset.comfygridStyles = '';
        target.prepend(style);
    }
    const text = css.join('\n').replaceAll(':root', ':host');
    if (style.textContent !== text) style.textContent = text;
}

function preserveInheritance(element: HTMLElement, host: HTMLElement) {
    const styles = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (!styles) return;
    for (const name of styles) {
        if (name.startsWith('--')) host.style.setProperty(name, styles.getPropertyValue(name));
    }
    for (const name of ['color', 'font-family', 'font-size', 'line-height', 'color-scheme']) {
        host.style.setProperty(name, styles.getPropertyValue(name));
    }
}

export function mountVueWidget(target: ShadowRoot, source: Document, api: ComfyDomWidgetApi, node: ComfyNode, widget: ComfyWidget): () => void {
    let current: HTMLElement | null = null;
    let placeholder: Comment | null = null;
    let originalParent: ParentNode | null = null;
    let originalNext: ChildNode | null = null;
    let stopped = false;
    let scheduled = false;
    let overlay: HTMLElement | null = null;
    let overlayRoot: ShadowRoot | null = null;
    const portals = new Map<HTMLElement, Comment>();
    const targetOptions = { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-controls', 'aria-expanded'] };
    const host = target.host as HTMLElement;
    const originalStyle = host.getAttribute('style');

    function restorePortal(element: HTMLElement, anchor: Comment) {
        if (anchor.isConnected && element.isConnected) anchor.replaceWith(element);
        else {
            anchor.remove();
            element.remove();
        }
    }

    function restore(keepOrigin = false) {
        targetObserver.disconnect();
        if (!stopped) targetObserver.observe(target, targetOptions);
        for (const [element, anchor] of portals) restorePortal(element, anchor);
        portals.clear();
        overlay?.remove();
        overlay = null;
        overlayRoot = null;
        if (current) {
            const live = api.getWidgetElement(node, widget) === current;
            if (live && placeholder?.isConnected) placeholder.replaceWith(current);
            else if (live && originalParent?.isConnected) {
                originalParent.insertBefore(current, originalNext?.parentNode === originalParent ? originalNext : null);
            } else current.remove();
            borrowedElements.delete(current);
        }
        if (!keepOrigin) {
            placeholder?.remove();
            placeholder = null;
            originalParent = null;
            originalNext = null;
        }
        current = null;
        if (originalStyle === null) host.removeAttribute('style');
        else host.setAttribute('style', originalStyle);
    }

    function movePortals() {
        if (!current) return;
        for (const [element, anchor] of portals) {
            if (!element.isConnected) {
                anchor.remove();
                portals.delete(element);
            }
        }
        const roots = [current, ...portals.keys()];
        for (const trigger of roots.flatMap((root) => Array.from(root.querySelectorAll('[aria-controls]')))) {
            for (const id of (trigger.getAttribute('aria-controls') ?? '').split(/\s+/)) {
                const content = source.getElementById(id);
                if (!content || current.contains(content)) continue;
                const element = content.closest<HTMLElement>('[data-reka-popper-content-wrapper]');
                if (!element || portals.has(element)) continue;
                if (!overlayRoot) {
                    overlay = target.ownerDocument.createElement('div');
                    preserveInheritance(current, overlay);
                    overlayRoot = overlay.attachShadow({ mode: 'open' });
                    targetObserver.observe(overlayRoot, targetOptions);
                    copyWidgetStyles(source, overlayRoot);
                    target.ownerDocument.body.append(overlay);
                }
                const anchor = source.createComment('comfygrid-popover');
                element.before(anchor);
                portals.set(element, anchor);
                overlayRoot.append(element);
            }
        }
    }

    function reconcile() {
        scheduled = false;
        if (stopped) return;
        if (!host.isConnected) {
            restore();
            return;
        }
        const element = api.getWidgetElement(node, widget);
        // Vue may replace the root in its current (borrowed) parent during a patch.
        if (current && element && element !== current && target.contains(element) && placeholder?.isConnected) {
            borrowedElements.delete(current);
            current = element;
            borrowedElements.add(element);
        }
        if (current && (element !== current || !current.isConnected || !placeholder?.isConnected)) restore(true);
        if (!current && element?.isConnected && !borrowedElements.has(element)) {
            preserveInheritance(element, host);
            copyWidgetStyles(source, target);
            if (!placeholder?.isConnected) {
                placeholder = source.createComment('comfygrid-vue-widget');
                originalParent = element.parentNode;
                originalNext = element.nextSibling;
                element.before(placeholder);
            }
            borrowedElements.add(element);
            current = element;
            target.append(element);
        }
        movePortals();
    }

    function schedule() {
        if (scheduled || stopped) return;
        scheduled = true;
        queueMicrotask(reconcile);
    }

    const Observer = source.defaultView?.MutationObserver;
    if (!Observer) return () => {};
    const observer = new Observer(schedule);
    observer.observe(source.body, { childList: true, subtree: true });
    const targetObserver = new Observer(schedule);
    targetObserver.observe(target, targetOptions);
    const stylesObserver = new Observer(() => {
        copyWidgetStyles(source, target);
        if (overlayRoot) copyWidgetStyles(source, overlayRoot);
    });
    stylesObserver.observe(source.head, { childList: true, subtree: true, characterData: true });
    reconcile();

    return () => {
        stopped = true;
        observer.disconnect();
        targetObserver.disconnect();
        stylesObserver.disconnect();
        restore();
    };
}
