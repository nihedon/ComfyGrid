class MxSlider extends (globalThis.ComfyGridWidget || HTMLElement) {
  static extension = "mx-slider";
  static template = "template.html#mx-slider";

  onInit() {
    this.addEventListener("input", (event) => {
      const target = event.target;
      const numberInput = this.querySelector('[data-role="number"]');
      if (target.dataset.role === "range" && numberInput) {
        numberInput.value = target.value;
      }
    });

    this.addEventListener("change", (event) => {
      const target = event.target;
      const value = Number.parseFloat(target.value);
      const rangeInput = this.querySelector('[data-role="range"]');
      if (target.dataset.role === "number" && rangeInput) {
        rangeInput.value = String(value);
      }
      this.#updateValue(value);
    });
  }

  onSync() {
    const node = this.node;
    const comfyNode = this.comfyNode;
    const props = node?.properties ?? comfyNode?.properties ?? {};
    const min = props.min ?? 0;
    const max = props.max ?? 1;
    const step = props.step ?? 0.01;
    const value =
      props.value ??
      (comfyNode?.intpos?.x != null
        ? min + comfyNode.intpos.x * (max - min)
        : (this.widget?.value ?? 0));

    const root = this.querySelector('[data-role="root"]');
    if (root) {
      root.dataset.name = this.widget?.name ?? "";
      root.title = this.widget?.tooltip ?? "";
    }

    const rangeInput = this.querySelector('[data-role="range"]');
    const numberInput = this.querySelector('[data-role="number"]');
    for (const input of [rangeInput, numberInput]) {
      if (input) {
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
      }
    }
  }

  #updateValue(value) {
    const comfyNode = this.comfyNode;
    if (!comfyNode) return;
    const props = this.node?.properties ?? comfyNode.properties ?? {};
    const min = props.min || 0;
    const max = props.max || 1;
    const ratio = max !== min ? (value - min) / (max - min) : 0;

    props.value = value;
    if (comfyNode.properties) comfyNode.properties.value = value;
    if (comfyNode.intpos) comfyNode.intpos.x = ratio;
    comfyNode.updateThisNodeGraph?.();
    if (comfyNode.widgets?.[0]) comfyNode.widgets[0].value = Math.floor(value);
    if (comfyNode.widgets?.[1]) comfyNode.widgets[1].value = value;
    this.save();
  }
}

if (!customElements.get("mx-slider")) {
  customElements.define("mx-slider", MxSlider);
}
