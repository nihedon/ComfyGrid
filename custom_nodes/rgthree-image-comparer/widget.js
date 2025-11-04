const RGTHREE_IMAGE_COMPARER_EXTENSION_NAME = "rgthree-image-comparer";
const RGTHREE_IMAGE_COMPARER_TEMPLATE_ID = "rgthree-image-comparer";

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

class RgthreeImageComparer extends HTMLElement {
  #widget = null;
  #unsubscribe = null;

  #image1 = null;
  #image2 = null;
  #btn1 = null;
  #btn2 = null;

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
    this.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;

      if (button.id === "compare-img1") {
        this.#toggleActiveImage(1);
      } else if (button.id === "compare-img2") {
        this.#toggleActiveImage(2);
      }
    });

    await this.#render();
    if (!this.isConnected) return;

    this.#unsubscribe = api.subscribe(this.#widget.node.id, (node) => {
      if (!this.isConnected) return;
      this.#widget = node.widgets?.[this.#widget.index];
      this.#render();
    });
  }

  async #render() {
    await renderExternalTemplate(RGTHREE_IMAGE_COMPARER_EXTENSION_NAME, RGTHREE_IMAGE_COMPARER_TEMPLATE_ID, this);
    if (!this.isConnected) return;

    this.#image1 = this.querySelector('[data-role="image1"]');
    this.#image2 = this.querySelector('[data-role="image2"]');
    this.#btn1 = this.querySelector("#compare-img1");
    this.#btn2 = this.querySelector("#compare-img2");

    this.#toggleActiveImage(1);
    this.#syncImage();
  }

  #toggleActiveImage(index) {
    if (index === 1) {
      this.#btn1.classList.add("active");
      this.#btn2.classList.remove("active");
      this.#image1.style.display = "";
      this.#image2.style.display = "none";
    } else {
      this.#btn1.classList.remove("active");
      this.#btn2.classList.add("active");
      this.#image1.style.display = "none";
      this.#image2.style.display = "";
    }
  }

  async #syncImage() {
    if (!this.#image1 || !this.#image2) return;
    const comfyNode = this.#widget.comfyNode;
    const images = comfyNode.canvasWidget?.value?.["images"] ?? [];
    const image1 = images[0]?.url ?? "";
    const image2 = images[images.length / 2]?.url ?? "";
    this.#image1.src = image1;
    this.#image1.style.visibility = image1 ? "visible" : "hidden";
    this.#image2.src = image2;
    this.#image2.style.visibility = image2 ? "visible" : "hidden";
  }
}

if (!customElements.get(RGTHREE_IMAGE_COMPARER_TEMPLATE_ID)) {
  customElements.define(RGTHREE_IMAGE_COMPARER_TEMPLATE_ID, RgthreeImageComparer);
}
