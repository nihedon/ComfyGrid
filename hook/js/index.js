import { app } from "../../scripts/app.js";

app.registerExtension({
  name: "comfyui.comfygrid",
  afterConfigureGraph() {
    window.parent?.dispatchEvent(
      new CustomEvent("comfygrid:graph_ready", {
        detail: { app },
      }),
    );
  },
});
