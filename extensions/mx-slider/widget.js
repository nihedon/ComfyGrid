const MX_SLIDER_EXTENSION_NAME = "mx-slider";
const MX_SLIDER_TEMPLATE_ID = "mx-slider";

async function loadTemplateDocument(extensionName) {
  const templateCache = (globalThis.__COMFYGRID_TEMPLATE_CACHE__ ??= new Map());
  if (templateCache.has(extensionName)) {
    return templateCache.get(extensionName);
  }

  const response = await fetch(`/comfygrid/api/extensions/${extensionName}/assets/template.html`);
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
  #isInitialized = false;
  #unsubscribe = null;

  #rangeInput = null;
  #numberInput = null;

  set widget(value) {
    this.#widget = value;
    if (this.#isInitialized && this.isConnected) {
      this.#syncValues();
    } else if (this.isConnected && !this.#isInitialized && this.#widget) {
      void this.#initialize();
    }
  }

  get widget() {
    return this.#widget;
  }

  connectedCallback() {
    if (this.#widget && !this.#isInitialized) {
      void this.#initialize();
    }
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#isInitialized = false;
  }

  async #initialize() {
    if (this.#isInitialized || !this.#widget) return;

    this.#setupEventListeners();
    await this.#render();
    if (!this.isConnected || !this.#widget) return;

    this.#isInitialized = true;
    this.#syncValues();

    const api = globalThis.api ?? globalThis.__COMFYGRID_WIDGETS__;
    if (api?.subscribe && this.#widget?.node?.id) {
      this.#unsubscribe?.();
      this.#unsubscribe = api.subscribe(this.#widget.node.id, (node) => {
        if (!this.isConnected) return;
        this.#widget = node.widgets?.[this.#widget.index];
        this.#syncValues();
      });
    }
  }

  #setupEventListeners() {
    this.addEventListener("input", (event) => {
      const target = event.target;
      if (target.dataset.role === "range" && this.#numberInput) {
        this.#numberInput.value = target.value;
      }
    });

    this.addEventListener("change", (event) => {
      const target = event.target;
      if (!this.#widget?.node) return;
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
  }

  async #render() {
    if (!this.#widget) return;
    await renderExternalTemplate(MX_SLIDER_EXTENSION_NAME, MX_SLIDER_TEMPLATE_ID, this);
    if (!this.isConnected) return;

    this.#rangeInput = this.querySelector('[data-role="range"]');
    this.#numberInput = this.querySelector('[data-role="number"]');
  }

  #syncValues() {
    if (!this.#widget || !this.isConnected) return;
    const node = this.#widget.node;
    const comfyNode = node?.comfyNode;
    const props = node?.properties ?? comfyNode?.properties ?? {};
    const name = this.#widget.name ?? "";
    const tooltip = this.#widget.tooltip ?? "";
    const min = props.min ?? 0;
    const max = props.max ?? 1;
    const step = props.step ?? 0.01;

    let value = props.value;
    if (value === undefined || value === null) {
      if (comfyNode?.intpos?.x != null) {
        value = min + comfyNode.intpos.x * (max - min);
      } else if (this.#widget.value != null) {
        value = this.#widget.value;
      } else if (comfyNode?.widgets?.[1]?.value != null) {
        value = comfyNode.widgets[1].value;
      } else {
        value = 0;
      }
    }

    const root = this.querySelector('[data-role="root"]');
    if (root) {
      root.dataset.name = name;
      root.title = tooltip;
    }

    if (this.#rangeInput) {
      this.#configureInput(this.#rangeInput, { name, min, max, step, value });
    }
    if (this.#numberInput) {
      this.#configureInput(this.#numberInput, { min, max, step, value });
    }
  }

  #update(value) {
    const node = this.#widget?.node;
    const comfyNode = node?.comfyNode;
    if (!comfyNode) return;

    const props = node.properties ?? comfyNode.properties ?? {};
    const min = props.min || 0;
    const max = props.max || 1;
    const ratio = max !== min ? (value - min) / (max - min) : 0;

    props.value = value;
    if (comfyNode.properties) {
      comfyNode.properties.value = value;
    }
    if (comfyNode.intpos) {
      comfyNode.intpos.x = ratio;
    }

    comfyNode.updateThisNodeGraph?.();

    if (comfyNode.widgets?.[0]) comfyNode.widgets[0].value = Math.floor(value);
    if (comfyNode.widgets?.[1]) comfyNode.widgets[1].value = value;
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
