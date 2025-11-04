const uiLoadedCallbacks: (() => void)[] = [];
const optionsChangedCallbacks: (() => void)[] = [];
const layoutChangedCallbacks: (() => void)[] = [];

export function setupCallbacks() {
    globalThis.onUiLoaded = (callback: () => void) => {
        uiLoadedCallbacks.push(callback);
    };

    globalThis.onOptionsChanged = (callback: () => void) => {
        optionsChangedCallbacks.push(callback);
    };

    globalThis.onLayoutChanged = (callback: () => void) => {
        layoutChangedCallbacks.push(callback);
    };
}

export function callUiLoadedCallbacks() {
    uiLoadedCallbacks.forEach((callback) => callback());
}

export function callOptionsChangedCallbacks() {
    optionsChangedCallbacks.forEach((callback) => callback());
}

export function callLayoutChangedCallbacks() {
    layoutChangedCallbacks.forEach((callback) => callback());
}
