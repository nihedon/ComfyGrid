class PowerLoraItem extends (globalThis.ComfyGridWidget || HTMLElement) {
  static sortable = true;
  static sortHandle = ".comfygrid-lora-handle";

  onInit() {
    const toggle = this.querySelector('[data-role="toggle"]');
    const strength = this.querySelector('[data-role="strength"]');
    const removeBtn = this.querySelector('[data-role="remove"]');

    toggle?.addEventListener("change", (e) => {
      if (!this.widget?.value) return;
      this.widget.value.on = e.target.checked;
      this.#saveWidgetValue();
    });

    strength?.addEventListener("input", (e) => {
      if (!this.widget?.value) return;
      this.widget.value.strength = Number.parseFloat(e.target.value);
      this.#saveWidgetValue();
    });

    removeBtn?.addEventListener("click", () => {
      this.removeSelf();
    });
  }

  onSync() {
    const widget = this.widget;
    if (!widget) return;
    const value = widget.value ?? {};

    const toggle = this.querySelector('[data-role="toggle"]');
    if (toggle) toggle.checked = Boolean(value.on);

    const strength = this.querySelector('[data-role="strength"]');
    if (strength) strength.value = String(value.strength ?? 1);

    this.#setupComboWidget();
  }

  #saveWidgetValue() {
    const widget = this.widget;
    if (!widget?.comfyWidget) return;

    const data = {
      lora: widget.value?.lora ?? "",
      on: widget.value?.on ?? true,
      strength: widget.value?.strength ?? 1,
    };
    widget.comfyWidget.value = data;
    widget.comfyWidget.setLora?.(data.lora);
    this.node?.updateNode({ silent: true });
  }

  #setupComboWidget() {
    const combo = this.querySelector('[data-role="combo"]');
    const widget = this.widget;
    if (!combo || !widget) return;

    const value = widget.value ?? {};
    const api = globalThis.api ?? globalThis.__COMFYGRID_WIDGETS__;
    const liveLoras = api ? (api.getModels("loras") ?? []).map((m) => m.path) : [];

    let isValidOverride;
    if (!value.on) {
      isValidOverride = true;
    } else if (liveLoras.length === 0 || liveLoras.includes(value.lora ?? "")) {
      isValidOverride = undefined;
    } else {
      isValidOverride = false;
    }

    combo.isValidOverride = isValidOverride;
    combo.widget = {
      id: widget.id || `lora_${this.node?.id}_${widget.index}`,
      name: widget.name,
      get options() {
        const apiInstance = globalThis.api ?? globalThis.__COMFYGRID_WIDGETS__;
        const models = apiInstance ? (apiInstance.getModels("loras") ?? []).map((m) => m.path) : [];
        return { values: models, fixed_values: [] };
      },
      node: this.node,
      get value() {
        return widget.value?.lora ?? "";
      },
      set value(v) {
        if (!widget.value) widget.value = {};
        widget.value.lora = v;
        widget.comfyWidget.value = { ...widget.value };
        widget.comfyWidget.setLora?.(v);
        this.node?.updateNode({ silent: true });
      },
      _node: this.node,
    };
  }
}

(globalThis.ComfyGridWidget || customElements).define?.("power-lora-item-widget", PowerLoraItem);
