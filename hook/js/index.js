import { app } from "../../scripts/app.js";
import { installWorkflowApi } from "./workflow-api.js";
import { installDomWidgetApi } from "./dom-widget-api.js";

app.registerExtension({
  name: "comfyui.comfygrid",
  setup() {
    installWorkflowApi(app);
    installDomWidgetApi(app);
  },
  afterConfigureGraph() {
    window.parent?.dispatchEvent(
      new CustomEvent("comfygrid:graph_ready", {
        detail: { app },
      }),
    );
  },
});
