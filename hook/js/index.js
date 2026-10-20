import { app } from "../../scripts/app.js";
import { installWorkflowApi } from "./workflow-api.js";

app.registerExtension({
  name: "comfyui.comfygrid",
  setup() {
    installWorkflowApi(app);
  },
  afterConfigureGraph() {
    window.parent?.dispatchEvent(
      new CustomEvent("comfygrid:graph_ready", {
        detail: { app },
      }),
    );
  },
});
