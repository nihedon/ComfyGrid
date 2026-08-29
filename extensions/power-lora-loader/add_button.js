const POWER_LORA_LOADER_ADD_TEMPLATE_ID = "power-lora-add-button";

class PowerLoraAddButton extends HTMLElement {
  #widget = null;

  set widget(value) {
    if (this.#widget === value) return;
    this.#widget = value;
    this.#render();
  }
  get widget() {
    return this.#widget;
  }

  connectedCallback() {
    this.#render();
  }

  #render() {
    let button = this.querySelector("cg-button-widget");
    if (!button) {
      this.innerHTML = "";
      button = document.createElement("cg-button-widget");
      button.variant = "secondary";
      button.addEventListener("click", () => {
        const api = globalThis.api ?? globalThis.__COMFYGRID_WIDGETS__;
        if (!api) return;

        api.openModelModal("models", ["loras"], (loraPath) => {
          const node = this.#widget?.node;
          const comfyNode = node?.comfyNode;
          if (comfyNode) {
            comfyNode.addNewLoraWidget(loraPath);
            node.updateNode();
          }
        });
      });
      this.appendChild(button);
    }

    button.widget = this.#widget;
    button.label = this.#widget?.label || this.#widget?.name || "Add LoRA";
  }
}

if (!customElements.get(POWER_LORA_LOADER_ADD_TEMPLATE_ID)) {
  customElements.define(POWER_LORA_LOADER_ADD_TEMPLATE_ID, PowerLoraAddButton);
}
