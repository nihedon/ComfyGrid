import type { Model, ModelTypes } from '@/states/storage-state.svelte';

class PopoverState {
    #visible = $state(false);
    #targetElement = $state<HTMLElement | null>();
    #model = $state<Model | null>();
    #modelKey = $state<ModelTypes | null>();

    get visible(): Readonly<boolean> {
        return this.#visible;
    }
    get targetElement(): Readonly<HTMLElement | null> {
        return this.#targetElement;
    }
    get model(): Readonly<Model | null> {
        return this.#model;
    }
    get modelKey(): Readonly<ModelTypes | null> {
        return this.#modelKey;
    }

    showModelPopover(target: HTMLElement, model: Model, modelKey: ModelTypes) {
        this.#targetElement = target;
        this.#model = model;
        this.#modelKey = modelKey;
        this.#visible = true;
    }

    isVisible(): boolean {
        return Boolean(this.#visible && this.#targetElement);
    }

    hidePopover() {
        this.#visible = false;
    }
}

export const popoverState = new PopoverState();
