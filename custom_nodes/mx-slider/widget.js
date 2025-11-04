const MX_SLIDER_EXTENSION_NAME = "mx-slider";
const MX_SLIDER_TEMPLATE_ID = "mx-slider";

async function loadTemplateDocument(extensionName) {
  const templateCache = (globalThis.__COMFYGRID_TEMPLATE_CACHE__ ??= new Map());
  if (templateCache.has(extensionName)) {
    return templateCache.get(extensionName);
  }

  const response = await fetch(`/comfygrid/api/custom_nodes/${extensionName}/assets/template.html`);
  if (!response.ok) {
    throw new Error(`Failed to load template for ${extensionName}`);
  }

  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  templateCache.set(extensionName, doc);
  return doc;
}

async function getTemplate(extensionName, templateId) {
  const doc = await loadTemplateDocument(extensionName);
  return doc.getElementById(templateId);
}

async function renderExternalTemplate(extensionName, templateId, target) {
  const template = await getTemplate(extensionName, templateId);
  const lit = globalThis.litHtml;
  const unsafeHTML = lit.unsafeHTML;
  lit.render(unsafeHTML(template.innerHTML), target);
}

class MxSlider extends HTMLElement {
  #widget = null;
  #props = null;
  #unsubscribe = null;

  #rangeInput = null;
  #numberInput = null;

  set widget(value) {
    this.#widget = value;
  }
  get widget() {
    return this.#widget;
  }

  connectedCallback() {
    void this.#initialize();
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
  }

  async #initialize() {
    this.addEventListener("input", (event) => {
      const target = event.target;
      if (target.dataset.role === "range" && this.#numberInput) {
        this.#numberInput.value = target.value;
      }
    });

    this.addEventListener("change", (event) => {
      const target = event.target;
      const node = this.#widget.node;
      const props = node.properties ?? {};

      if (target.dataset.role === "range") {
        const value = Number.parseFloat(target.value);
        props.value = value;
        this.#update(value);
      } else if (target.dataset.role === "number") {
        const value = Number.parseFloat(target.value);
        if (this.#rangeInput) {
          this.#rangeInput.value = String(value);
        }
        props.value = value;
        this.#update(value);
      }
    });

    await this.#render();
    if (!this.isConnected) return;

    const node = this.#widget.node;
    this.#props = node.properties ?? {};

    this.#unsubscribe = api.subscribe(this.#widget.node.id, (node) => {
      if (!this.isConnected) return;
      this.#widget = node.widgets?.[this.#widget.index];
      this.#render();
    });
  }

  async #render() {
    const node = this.#widget.node;
    const props = node.properties ?? {};
    const name = this.#widget.name ?? "";
    const tooltip = this.#widget.tooltip ?? "";
    const min = props.min ?? 0;
    const max = props.max ?? 1;
    const step = props.step ?? 0.01;
    const value = props.value ?? 0;

    await renderExternalTemplate(MX_SLIDER_EXTENSION_NAME, MX_SLIDER_TEMPLATE_ID, this);
    if (!this.isConnected) return;

    const root = this.querySelector('[data-role="root"]');
    root.dataset.name = name;
    root.title = tooltip;

    this.#rangeInput = this.querySelector('[data-role="range"]');
    this.#numberInput = this.querySelector('[data-role="number"]');

    this.#configureInput(this.#rangeInput, { name, min, max, step, value });
    this.#configureInput(this.#numberInput, { min, max, step, value });
  }

  #update(value) {
    const node = this.#widget.node;
    const min = node.properties.min || 0;
    const max = node.properties.max || 1;
    const ratio = (value - min) / (max - min);

    const comfyNode = node.comfyNode;

    // Set position and value
    comfyNode.intpos.x = ratio;
    comfyNode.properties.value = value;

    // Call updateThisNodeGraph method
    comfyNode.updateThisNodeGraph?.();

    comfyNode.widgets[0].value = Math.floor(value);
    comfyNode.widgets[1].value = value;
  }

  #configureInput(input, attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      input.setAttribute(key, String(value));
    }
    input.value = String(attrs.value);
  }
}

if (!customElements.get(MX_SLIDER_TEMPLATE_ID)) {
  customElements.define(MX_SLIDER_TEMPLATE_ID, MxSlider);
}
