class RgthreeImageComparer extends (globalThis.ComfyGridWidget || HTMLElement) {
  #image1 = null;
  #image2 = null;
  #btn1 = null;
  #btn2 = null;

  onInit() {
    this.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;

      if (button.id === "compare-img1") {
        this.#toggleActiveImage(1);
      } else if (button.id === "compare-img2") {
        this.#toggleActiveImage(2);
      }
    });

    this.#image1 = this.querySelector('[data-role="image1"]');
    this.#image2 = this.querySelector('[data-role="image2"]');
    this.#btn1 = this.querySelector("#compare-img1");
    this.#btn2 = this.querySelector("#compare-img2");

    this.#toggleActiveImage(1);
  }

  onSync() {
    if (!this.#image1 || !this.#image2) return;
    const comfyNode = this.comfyNode || this.node?.comfyNode;
    if (!comfyNode) return;

    const images = comfyNode.canvasWidget?.value?.["images"] ?? [];
    const image1 = images[0]?.url ?? "";
    const image2 = images[Math.floor(images.length / 2)]?.url ?? "";
    this.#image1.src = image1;
    this.#image1.style.visibility = image1 ? "visible" : "hidden";
    this.#image2.src = image2;
    this.#image2.style.visibility = image2 ? "visible" : "hidden";
  }

  #toggleActiveImage(index) {
    if (!this.#btn1 || !this.#btn2 || !this.#image1 || !this.#image2) return;
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
}

(globalThis.ComfyGridWidget || customElements).define?.("rgthree-image-comparer-widget", RgthreeImageComparer);
