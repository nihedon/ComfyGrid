class Bypasser extends (globalThis.ComfyGridWidget || HTMLElement) {
  onInit() {
    this.querySelector('[data-role="toggle"]')?.addEventListener("change", (e) => {
      const checked = Boolean(e.detail?.checked ?? e.target.checked);
      if (this.widget?.value) {
        this.widget.value.toggled = checked;
        this.widget.comfyWidget?.doModeChange?.(checked);
      }
    });
  }

  onSync() {
    const widget = this.widget;
    if (!widget) return;

    const root = this.querySelector('[data-role="root"]');
    if (root) {
      root.dataset.name = widget.name ?? "";
      root.title = widget.tooltip ?? "";
    }

    const toggleEl = this.querySelector('[data-role="toggle"]');
    if (toggleEl) {
      toggleEl.label = widget.label ?? widget.name ?? "";
      toggleEl.checked = Boolean(widget.value?.toggled);
    }
  }
}

(globalThis.ComfyGridWidget || customElements).define?.("bypasser-widget", Bypasser);
