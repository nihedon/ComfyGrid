type PageId = 'grid' | 'comfyui' | 'model' | 'image-info' | 'settings';

class UIState {
    #activePageId: PageId = $state('grid');
    #isDragging: boolean = $state(false);
    #needRefresh: boolean = $state(false);

    get activePageId(): PageId {
        return this.#activePageId;
    }
    set activePageId(activePageId: 'grid' | 'comfyui' | 'model' | 'image-info' | 'settings') {
        this.#activePageId = activePageId;
    }

    get needRefresh(): boolean {
        return this.#needRefresh;
    }
    set needRefresh(needRefresh: boolean) {
        this.#needRefresh = needRefresh;
    }

    get isDragging(): boolean {
        return this.#isDragging;
    }
    set isDragging(isDragging: boolean) {
        this.#isDragging = isDragging;
    }
}

export const uiState = new UIState();
