export interface NumberScrubSettings {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    readonly?: boolean;
}

type ValidSettings = NumberScrubSettings & { min: number; max: number; step: number };

interface ScrubCallbacks {
    getSettings(): NumberScrubSettings;
    onPreview(value: number): void;
    onCommit(): void;
}

export const PIXELS_PER_STEP = 4;
const DRAG_THRESHOLD = 3;

export function scrubSpeed(modifiers: { shiftKey: boolean; ctrlKey: boolean }): number {
    return modifiers.shiftKey ? 0.25 : modifiers.ctrlKey ? 4 : 1;
}

export function isScrubbableNumber(settings: NumberScrubSettings): settings is ValidSettings {
    return (
        !settings.readonly &&
        Number.isFinite(settings.value) &&
        typeof settings.min === 'number' &&
        Number.isFinite(settings.min) &&
        typeof settings.max === 'number' &&
        Number.isFinite(settings.max) &&
        settings.min <= settings.max &&
        typeof settings.step === 'number' &&
        Number.isFinite(settings.step) &&
        settings.step > 0
    );
}

function decimalPlaces(value: number): number {
    const [coefficient, exponent = '0'] = value.toString().split('e');
    return Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent));
}

export function scrubbedValue(settings: ValidSettings, distance: number): number {
    const ticks = Math.trunc(distance / PIXELS_PER_STEP);
    const precision = Math.min(100, Math.max(decimalPlaces(settings.value), decimalPlaces(settings.step)));
    const value = Number((settings.value + ticks * settings.step).toFixed(precision));
    return Math.max(settings.min, Math.min(settings.max, value));
}

export function scrubbableNumber(input: HTMLInputElement, callbacks: ScrubCallbacks) {
    const document = input.ownerDocument;
    const window = document.defaultView;
    let gesture: {
        pointerId: number;
        startX: number;
        lastX: number;
        segmentX: number;
        distance: number;
        speed: number;
        settings: ValidSettings;
        value: number;
        dragged: boolean;
    } | null = null;
    let suppressClick = false;

    function finish(commit: boolean) {
        const previous = gesture;
        if (!previous) return;
        gesture = null;
        document.removeEventListener('keydown', keydown, true);
        window?.removeEventListener('blur', cancel);
        if (input.hasPointerCapture(previous.pointerId)) input.releasePointerCapture(previous.pointerId);
        if (!previous.dragged) return;
        suppressClick = true;
        if (!commit) callbacks.onPreview(previous.settings.value);
        else if (previous.value !== previous.settings.value) callbacks.onCommit();
    }

    function cancel() {
        finish(false);
    }

    function keydown(event: KeyboardEvent) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        cancel();
    }

    function pointerdown(event: PointerEvent) {
        suppressClick = false;
        if (
            gesture ||
            event.button !== 0 ||
            !event.isPrimary ||
            event.pointerType === 'touch' ||
            event.metaKey ||
            event.altKey ||
            input.disabled ||
            input.readOnly ||
            document.activeElement === input
        )
            return;
        const settings = callbacks.getSettings();
        if (!isScrubbableNumber(settings)) return;
        // Leave the native number spinner alone; focused inputs retain text selection.
        if (event.clientX >= input.getBoundingClientRect().right - 24) return;
        gesture = {
            pointerId: event.pointerId,
            startX: event.clientX,
            lastX: event.clientX,
            segmentX: event.clientX,
            distance: 0,
            speed: scrubSpeed(event),
            settings: { ...settings },
            value: settings.value,
            dragged: false,
        };
        event.preventDefault();
        event.stopPropagation();
        input.setPointerCapture(event.pointerId);
        document.addEventListener('keydown', keydown, true);
        window?.addEventListener('blur', cancel);
    }

    function pointermove(event: PointerEvent) {
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const speed = scrubSpeed(event);
        if (!gesture.dragged) {
            if (Math.abs(event.clientX - gesture.startX) < DRAG_THRESHOLD) return;
            gesture.dragged = true;
            gesture.speed = speed;
        } else if (speed !== gesture.speed) {
            // Keep completed movement unchanged when switching speed mid-drag.
            gesture.distance += (gesture.lastX - gesture.segmentX) * gesture.speed;
            gesture.segmentX = gesture.lastX;
            gesture.speed = speed;
        }
        const distance = gesture.distance + (event.clientX - gesture.segmentX) * gesture.speed;
        gesture.lastX = event.clientX;
        event.preventDefault();
        event.stopPropagation();
        const value = scrubbedValue(gesture.settings, distance);
        if (value !== gesture.value) {
            gesture.value = value;
            callbacks.onPreview(value);
        }
    }

    function pointerup(event: PointerEvent) {
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const dragged = gesture.dragged;
        if (dragged) event.stopPropagation();
        finish(true);
        if (!dragged) {
            input.focus({ preventScroll: true });
            input.select();
        }
    }

    function pointercancel(event: PointerEvent) {
        if (gesture?.pointerId === event.pointerId) cancel();
    }

    function click(event: MouseEvent) {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
    }

    input.addEventListener('pointerdown', pointerdown);
    input.addEventListener('pointermove', pointermove);
    input.addEventListener('pointerup', pointerup);
    input.addEventListener('pointercancel', pointercancel);
    input.addEventListener('lostpointercapture', pointercancel);
    input.addEventListener('click', click, true);

    return {
        update(next: ScrubCallbacks) {
            callbacks = next;
        },
        destroy() {
            cancel();
            input.removeEventListener('pointerdown', pointerdown);
            input.removeEventListener('pointermove', pointermove);
            input.removeEventListener('pointerup', pointerup);
            input.removeEventListener('pointercancel', pointercancel);
            input.removeEventListener('lostpointercapture', pointercancel);
            input.removeEventListener('click', click, true);
        },
    };
}
