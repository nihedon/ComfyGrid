class PowerLoraAddButton extends (globalThis.ComfyGridWidget || HTMLElement) {
  onInit() {
    this.innerHTML = "";
    const button = document.createElement("cg-button-widget");
    button.variant = "secondary";
    button.label = this.widget?.label || this.widget?.name || "Add LoRA";
    button.addEventListener("click", () => {
      const api = globalThis.api ?? globalThis.__COMFYGRID_WIDGETS__;
      if (!api) return;

      api.openModelModal("models", ["loras"], (loraPath) => {
        const node = this.node;
        const comfyNode = this.comfyNode;
        if (comfyNode) {
          comfyNode.addNewLoraWidget(loraPath);
          node?.updateNode();
        }
      });
    });
    this.appendChild(button);
  }

  onSync() {
    const button = this.querySelector("cg-button-widget");
    if (button) {
      button.widget = this.widget;
      button.label = this.widget?.label || this.widget?.name || "Add LoRA";
    }
  }
}

(globalThis.ComfyGridWidget || customElements).define?.("power-lora-add-button-widget", PowerLoraAddButton);
