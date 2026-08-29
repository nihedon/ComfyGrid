const POWER_LORA_LOADER_EXTENSION_NAME = "power-lora-loader";
const POWER_LORA_LOADER_LIST_TEMPLATE_ID = "power-lora-list";
const POWER_LORA_LOADER_ROW_TEMPLATE_ID = "power-lora-row";
const POWER_LORA_LOADER_ADD_TEMPLATE_ID = "power-lora-add-button";

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

function setWidgetIndex(root, widgetIndex) {
  root.dataset.widgetIndex = String(widgetIndex);
  root.querySelectorAll("[data-action]").forEach((element) => {
    element.dataset.widgetIndex = String(widgetIndex);
  });
}

class PowerLoraList extends HTMLElement {
  #node = null;
  #widgets = [];
  #unsubscribe = null;

  #rowTemplate = null;

  set node(value) {
    this.#node = value;
  }
  get node() {
    return this.#node;
  }

  set widgets(value) {
    this.#widgets = value;
  }
  get widgets() {
    return this.#widgets;
  }

  connectedCallback() {
    void this.#initialize();
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
    this.#destroyListSortable();
  }

  async #initialize() {
    this.#rowTemplate = await getTemplate(POWER_LORA_LOADER_EXTENSION_NAME, POWER_LORA_LOADER_ROW_TEMPLATE_ID);
    if (!this.isConnected) return;

    this.addEventListener("change", (event) => this.#handleChange(event));
    this.addEventListener("click", (event) => this.#handleClick(event));

    await this.#render();
    if (!this.isConnected) return;

    this.#unsubscribe = api.subscribe(this.#node.id, (node) => {
      if (!this.isConnected) return;
      this.#node = node;
      this.#widgets = node.widgets.filter((w) => w.className === "PowerLoraLoaderWidget");
      this.#render();
    });
  }

  async #render() {
    if (!this.#rowTemplate) return;

    let section = this.querySelector('[data-role="list"]');
    if (!section) {
      await renderExternalTemplate(POWER_LORA_LOADER_EXTENSION_NAME, POWER_LORA_LOADER_LIST_TEMPLATE_ID, this);
      if (!this.isConnected) return;
      section = this.querySelector('[data-role="list"]');
    }

    const loraValues = api.getModels("loras").map((m) => m.path);

    const existingRows = Array.from(section.querySelectorAll("[data-list-index]"));
    const targetCount = this.#widgets.length;
    const countChanged = existingRows.length !== targetCount;

    if (countChanged) {
      this.#destroyListSortable();
    }

    const loraOptions = { values: loraValues, fixed_values: [] };

    for (let i = 0; i < targetCount; i++) {
      if (i < existingRows.length) {
        this.#updateRow(existingRows[i], this.#widgets[i], i, loraValues, loraOptions);
      } else {
        const newRow = this.#createRow(this.#widgets[i], i);
        section.append(newRow);
        this.#setupComboWidget(newRow, this.#widgets[i], i, loraValues, loraOptions);
      }
    }

    for (let i = targetCount; i < existingRows.length; i++) {
      existingRows[i].remove();
    }

    if (countChanged || !section.classList.contains("ui-sortable")) {
      this.#initSortable(section);
    }
  }

  #destroyListSortable() {
    const $ = globalThis.jQuery;
    const section = this.querySelector('[data-role="list"]');
    if (!section || !$?.fn?.sortable) return;
    try {
      $(section).sortable("destroy");
    } catch {
      /* list was not sortable */
    }
  }

  #initSortable(section) {
    const $ = globalThis.jQuery;
    if (!$?.fn?.sortable) return;

    let fromListIndex = null;

    $(section).sortable({
      axis: "y",
      containment: "parent",
      cursor: "grabbing",
      handle: ".comfygrid-lora-handle",
      tolerance: "pointer",
      distance: 4,
      start: (_event, ui) => {
        fromListIndex = ui.item.index();
      },
      update: (_event, ui) => {
        const toListIndex = ui.item.index();
        const fromIndex = fromListIndex;
        fromListIndex = null;

        if (fromIndex == null || fromIndex === toListIndex) return;

        const fromWidgetIndex = this.#widgets[fromIndex]?.index;
        const toWidgetIndex = this.#widgets[toListIndex]?.index;
        if (fromWidgetIndex == null || toWidgetIndex == null) return;

        this.#widgets.splice(toWidgetIndex, 0, this.#widgets.splice(fromWidgetIndex, 1)[0]);

        const comfyNode = this.#node.comfyNode;
        comfyNode.widgets.splice(toWidgetIndex, 0, comfyNode.widgets.splice(fromWidgetIndex, 1)[0]);
        this.#node.updateNode();
      },
    });
  }

  #setupComboWidget(row, widget, listIndex, loraValues, loraOptions) {
    const combo = row.querySelector('[data-role="combo"]');
    if (!combo) return;

    const value = widget.value ?? {};
    let isValidOverride;
    if (!value.on) {
      isValidOverride = true;
    } else if (loraValues.length === 0 || loraValues.includes(value.lora ?? "")) {
      isValidOverride = undefined;
    } else {
      isValidOverride = false;
    }

    const fakeWidget = {
      id: `lora_${this.#node.id}_${listIndex}`,
      name: `lora_${listIndex}`,
      options: loraOptions,
      node: this.#node,
      get value() {
        return widget.value.lora ?? "";
      },
      set value(v) {
        widget.value.lora = v;
        widget.comfyWidget.value = { ...widget.value };
        widget.comfyWidget.setLora(v);
        this._node.updateNode({ silent: true });
      },
      _node: this.#node,
    };

    combo.isValidOverride = isValidOverride;
    combo.widget = fakeWidget;
  }

  #updateRow(row, widget, listIndex, loraValues, loraOptions) {
    const value = widget.value ?? {};

    if (row.dataset.listIndex !== String(listIndex)) {
      row.dataset.listIndex = String(listIndex);
      setWidgetIndex(row, listIndex);
    }

    const toggle = row.querySelector('[data-role="toggle"]');
    const strength = row.querySelector('[data-role="strength"]');

    if (toggle && toggle.checked !== Boolean(value.on)) {
      toggle.checked = Boolean(value.on);
    }
    const strengthStr = String(value.strength ?? 1);
    if (strength && strength.value !== strengthStr) {
      strength.value = strengthStr;
    }

    this.#setupComboWidget(row, widget, listIndex, loraValues, loraOptions);
  }

  #createRow(widget, listIndex) {
    const value = widget.value ?? {};
    const row = this.#rowTemplate.content.firstElementChild.cloneNode(true);

    row.dataset.listIndex = String(listIndex);
    setWidgetIndex(row, listIndex);

    const toggle = row.querySelector('[data-role="toggle"]');
    const strength = row.querySelector('[data-role="strength"]');

    if (toggle) toggle.checked = Boolean(value.on);
    if (strength) strength.value = String(value.strength ?? 1);

    return row;
  }

  #handleChange(event) {
    const target = event.target;
    const action = target.dataset.action;
    const widgetIndex = Number(target.dataset.widgetIndex);
    const widget = this.#widgets[widgetIndex];
    if (!widget) return;

    if (action === "toggle") {
      widget.value.on = target.checked;
    } else if (action === "strength") {
      widget.value.strength = Number.parseFloat(target.value);
    } else {
      return;
    }

    const data = {
      lora: widget.value.lora,
      on: widget.value.on,
      strength: widget.value.strength,
    };
    widget.comfyWidget.value = data;
    widget.comfyWidget.setLora(data.lora);

    this.#node.updateNode({ silent: true });
  }

  #handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const widgetIndex = Number(button.dataset.widgetIndex);

    if (button.dataset.action === "remove") {
      const widget = this.#widgets[widgetIndex];
      const comfyNode = this.#node.comfyNode;
      comfyNode.widgets.splice(widget.index, 1);
      this.#node.updateNode();
    }
  }
}

if (!customElements.get(POWER_LORA_LOADER_LIST_TEMPLATE_ID)) {
  customElements.define(POWER_LORA_LOADER_LIST_TEMPLATE_ID, PowerLoraList);
}

class PowerLoraAddButton extends HTMLElement {
  #widget = null;

  set widget(value) {
    this.#widget = value;
  }
  get widget() {
    return this.#widget;
  }

  connectedCallback() {
    void this.#initialize();
  }

  async #initialize() {
    await renderExternalTemplate(POWER_LORA_LOADER_EXTENSION_NAME, POWER_LORA_LOADER_ADD_TEMPLATE_ID, this);
    if (!this.isConnected) return;

    const button = this.querySelector('[data-role="add"]');
    button.textContent = this.#widget?.label || this.#widget?.name || "Add LoRA";
    button.addEventListener("click", () => this.#handleClick());
  }

  #handleClick() {
    api.openModelModal("models", ["loras"], (loraPath) => {
      const node = this.#widget.node;
      const comfyNode = node.comfyNode;
      comfyNode.addNewLoraWidget(loraPath);
      node.updateNode();
    });
  }
}

if (!customElements.get(POWER_LORA_LOADER_ADD_TEMPLATE_ID)) {
  customElements.define(POWER_LORA_LOADER_ADD_TEMPLATE_ID, PowerLoraAddButton);
}

if (typeof window !== "undefined" && window.comfygrid?.registerExtension) {
  window.comfygrid.registerExtension({
    name: "power-lora-loader",
    version: "1.0.0",
    description: "LoRA list widget for PowerLoraLoader nodes",
    nodeWidgets: [
      {
        match: { widgetClassName: "PowerLoraLoaderWidget" },
        element: "power-lora-list",
        groupBy: "widget_class_name",
      },
      {
        match: { widgetClassName: "RgthreeBetterButtonWidget" },
        element: "power-lora-add-button",
      },
    ],
  });
}
