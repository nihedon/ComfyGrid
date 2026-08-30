const POWER_LORA_LOADER_EXTENSION_NAME = "power-lora-loader";
const POWER_LORA_LOADER_ITEM_TEMPLATE_ID = "power-lora-item";

function getApi() {
  return globalThis.api ?? globalThis.__COMFYGRID_WIDGETS__;
}

async function loadTemplateDocument(extensionName) {
  const templateCache = (globalThis.__COMFYGRID_TEMPLATE_CACHE__ ??= new Map());
  const cacheKey = `${extensionName}/lora.html`;
  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey);
  }

  const response = await fetch(`/comfygrid/api/extensions/${extensionName}/assets/lora.html`);
  if (!response.ok) {
    throw new Error(`Failed to load template for ${extensionName}`);
  }

  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  templateCache.set(cacheKey, doc);
  return doc;
}

async function getTemplate(extensionName, templateId) {
  const doc = await loadTemplateDocument(extensionName);
  const template = doc.getElementById(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }
  return template;
}

async function renderExternalTemplate(extensionName, templateId, target) {
  const template = await getTemplate(extensionName, templateId);
  const lit = globalThis.litHtml;
  const unsafeHTML = lit.unsafeHTML;
  lit.render(unsafeHTML(template.innerHTML), target);
}

class PowerLoraItem extends HTMLElement {
  #widget = null;
  #isInitialized = false;

  set widget(value) {
    const prevLora = this.#widget?.value?.lora;
    const prevOn = this.#widget?.value?.on;
    const prevStrength = this.#widget?.value?.strength;

    this.#widget = value;

    if (this.#isInitialized && this.isConnected) {
      this.#syncValues(prevLora, prevOn, prevStrength);
    }
  }

  get widget() {
    return this.#widget;
  }

  connectedCallback() {
    void this.#initialize();
    this.#setupSortable();
  }

  async #initialize() {
    if (this.#isInitialized) return;
    await renderExternalTemplate(POWER_LORA_LOADER_EXTENSION_NAME, POWER_LORA_LOADER_ITEM_TEMPLATE_ID, this);
    if (!this.isConnected) return;

    this.#isInitialized = true;
    this.#setupEventListeners();
    this.#syncValues();
    this.#setupSortable();
  }

  #setupSortable() {
    const container = this.closest(".widget-stack");
    const $ = globalThis.jQuery;
    if (!container || !$?.fn?.sortable) return;

    if (!container.classList.contains("ui-sortable")) {
      $(container).sortable({
        items: "power-lora-item",
        handle: ".comfygrid-lora-handle",
        axis: "y",
        cursor: "grabbing",
        tolerance: "pointer",
        distance: 4,
        update: () => {
          const node = this.#widget?.node;
          const comfyNode = node?.comfyNode;
          if (!comfyNode?.widgets) return;

          const renderedItems = Array.from(container.querySelectorAll("power-lora-item"));
          const sortedComfyWidgets = [];

          for (const item of renderedItems) {
            if (item.widget?.comfyWidget) {
              sortedComfyWidgets.push(item.widget.comfyWidget);
            }
          }

          $(container).sortable("cancel");

          let sortedIndex = 0;
          comfyNode.widgets = comfyNode.widgets.map((w) => {
            if (sortedComfyWidgets.includes(w)) {
              return sortedComfyWidgets[sortedIndex++];
            }
            return w;
          });

          node.updateNode();
        },
      });
    }
  }

  #setupEventListeners() {
    const toggle = this.querySelector('[data-role="toggle"]');
    const strength = this.querySelector('[data-role="strength"]');
    const removeBtn = this.querySelector('[data-role="remove"]');

    if (toggle) {
      toggle.addEventListener("change", (e) => {
        if (!this.#widget) return;
        this.#widget.value.on = e.target.checked;
        this.#saveWidgetValue();
      });
    }

    if (strength) {
      strength.addEventListener("input", (e) => {
        if (!this.#widget) return;
        this.#widget.value.strength = Number.parseFloat(e.target.value);
        this.#saveWidgetValue();
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        if (!this.#widget) return;
        const node = this.#widget.node;
        const comfyNode = node?.comfyNode;
        const widgetIndex = this.#widget.index;
        if (comfyNode && widgetIndex !== undefined) {
          comfyNode.widgets.splice(widgetIndex, 1);
          node.updateNode();
        }
      });
    }
  }

  #saveWidgetValue() {
    const widget = this.#widget;
    if (!widget) return;

    const data = {
      lora: widget.value?.lora ?? "",
      on: widget.value?.on ?? true,
      strength: widget.value?.strength ?? 1,
    };
    widget.comfyWidget.value = data;
    widget.comfyWidget.setLora(data.lora);

    const node = widget.node;
    if (node) {
      node.updateNode({ silent: true });
    }
  }

  #syncValues(prevLora, prevOn, prevStrength) {
    if (!this.#widget) return;
    const value = this.#widget.value ?? {};

    const toggle = this.querySelector('[data-role="toggle"]');
    if (toggle && (prevOn === undefined || prevOn !== value.on)) {
      toggle.checked = Boolean(value.on);
    }

    const strength = this.querySelector('[data-role="strength"]');
    if (strength && (prevStrength === undefined || prevStrength !== value.strength)) {
      strength.value = String(value.strength ?? 1);
    }

    this.#setupComboWidget();
  }

  #setupComboWidget() {
    const combo = this.querySelector('[data-role="combo"]');
    if (!combo || !this.#widget) return;

    const widget = this.#widget;
    const value = widget.value ?? {};
    const node = widget.node;
    const api = getApi();
    const liveLoras = api ? (api.getModels("loras") ?? []).map((m) => m.path) : [];

    let isValidOverride;
    if (!value.on) {
      isValidOverride = true;
    } else if (liveLoras.length === 0 || liveLoras.includes(value.lora ?? "")) {
      isValidOverride = undefined;
    } else {
      isValidOverride = false;
    }

    const fakeWidget = {
      id: widget.id || `lora_${node?.id}_${widget.index}`,
      name: widget.name,
      get options() {
        const apiInstance = getApi();
        const models = apiInstance ? (apiInstance.getModels("loras") ?? []).map((m) => m.path) : [];
        return { values: models, fixed_values: [] };
      },
      node: node,
      get value() {
        return widget.value?.lora ?? "";
      },
      set value(v) {
        if (!widget.value) widget.value = {};
        widget.value.lora = v;
        widget.comfyWidget.value = { ...widget.value };
        widget.comfyWidget.setLora(v);
        this._node?.updateNode({ silent: true });
      },
      _node: node,
    };

    combo.isValidOverride = isValidOverride;
    combo.widget = fakeWidget;
  }
}

if (!customElements.get(POWER_LORA_LOADER_ITEM_TEMPLATE_ID)) {
  customElements.define(POWER_LORA_LOADER_ITEM_TEMPLATE_ID, PowerLoraItem);
}
