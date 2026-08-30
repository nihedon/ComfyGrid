class Bypasser extends (globalThis.ComfyGridWidget || HTMLElement) {
  static extension = "bypasser";
  static template = "template.html#bypasser-widget";

  onInit() {
    const toggleEl = this.querySelector('[data-role="toggle"]');
    if (toggleEl) {
      toggleEl.addEventListener("change", (event) => {
        const checked = Boolean(event.detail?.checked ?? event.target.checked);
        this.#updateValue(checked);
      });
    }
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
      toggleEl.checked = Boolean(widget.value.toggled);
    }
  }

  #updateValue(checked) {
    if (!this.widget) return;
    this.widget.value.toggled = checked;
    this.widget.comfyWidget.doModeChange(checked);
    // this.save();
  }
}

if (!customElements.get("bypasser-widget")) {
  customElements.define("bypasser-widget", Bypasser);
}
