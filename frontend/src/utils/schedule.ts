import { tick } from 'svelte';

export function debounceOnTick(callback: () => void) {
    let isScheduled = false;

    return () => {
        if (isScheduled) {
            return;
        }

        isScheduled = true;

        queueMicrotask(() => {
            tick().then(() => {
                isScheduled = false;
                callback();
            });
        });
    };
}

export async function waitForDom(): Promise<void> {
    await tick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
