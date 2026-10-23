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
    css.push(
        ':host(.fit-node) > :not(style) { box-sizing: border-box; width: 100% !important; height: 100% !important; min-width: 0 !important; min-height: 0 !important; max-width: 100% !important; max-height: 100% !important; overflow: hidden; }',
    );
    css.push(':host(.fit-node) > [data-testid="bounding-boxes"] > * { flex-shrink: 0; }');
    let style = target.querySelector<HTMLStyleElement>('style[data-comfygrid-styles]');
    if (!style) {
        style = target.ownerDocument.createElement('style');
        style.dataset.comfygridStyles = '';
        target.prepend(style);
    }
    const text = css.join('\n').replaceAll(':root', ':host');
    if (style.textContent !== text) style.textContent = text;
}

function fitBoundingBoxes(target: ShadowRoot): () => void {
    const host = target.host as HTMLElement;
    const saved = new Map<HTMLElement, string>();
    const resize = new ResizeObserver(update);
    let observed: Element[] = [];

    function update() {
        const root = target.querySelector<HTMLElement>('[data-testid="bounding-boxes"]');
        const canvas = root?.querySelector('canvas');
        const area = canvas?.parentElement;
        const section = area?.parentElement;
        if (!root || !area || !section) return;
        const elements = [host, root, section, ...root.children, ...section.children];
        if (elements.length !== observed.length || elements.some((element, index) => element !== observed[index])) {
            resize.disconnect();
            for (const element of elements) resize.observe(element);
            observed = elements;
        }
        if (!saved.has(area)) saved.set(area, area.style.width);
        if (!host.classList.contains('fit-node')) {
            const width = saved.get(area)!;
            if (area.style.width !== width) area.style.width = width;
            return;
        }
        const styles = getComputedStyle(root);
        const sectionStyles = getComputedStyle(section);
        const ratio = getComputedStyle(area).aspectRatio.split('/').map(Number);
        const aspect = ratio[0] / (ratio[1] || 1);
        if (!Number.isFinite(aspect) || aspect <= 0) return;
        const childrenHeight = (parent: HTMLElement, except: HTMLElement) =>
            Array.from(parent.children).reduce((sum, child) => sum + (child === except ? 0 : child.getBoundingClientRect().height), 0);
        const gap = (style: CSSStyleDeclaration, count: number) => (parseFloat(style.rowGap) || 0) * Math.max(0, count - 1);
        const available =
            root.clientHeight -
            childrenHeight(root, section) -
            childrenHeight(section, area) -
            gap(styles, root.children.length) -
            gap(sectionStyles, section.children.length) -
            (parseFloat(styles.paddingTop) || 0) -
            (parseFloat(styles.paddingBottom) || 0);
        const width = `${Math.max(0, Math.min(section.clientWidth, available * aspect))}px`;
        if (area.style.width !== width) area.style.width = width;
    }

    const mutations = new MutationObserver(update);
    mutations.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    const classes = new MutationObserver(update);
    classes.observe(host, { attributes: true, attributeFilter: ['class'] });
    resize.observe(host);
    update();
    return () => {
        resize.disconnect();
        mutations.disconnect();
        classes.disconnect();
        for (const [element, width] of saved) element.style.width = width;
        saved.clear();
    };
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
    const stopFitting = fitBoundingBoxes(target);

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
    if (!Observer) return stopFitting;
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
        stopFitting();
        observer.disconnect();
        targetObserver.disconnect();
        stylesObserver.disconnect();
        restore();
    };
}
