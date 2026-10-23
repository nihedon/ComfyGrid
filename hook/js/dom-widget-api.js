const viewportComponents = new Map([
  ["cameraAngle", new Set(["CameraAngle"])],
  ["load3D", new Set(["Load3D"])],
  ["load3DAdvanced", new Set(["Load3DAdvanced", "Load3D"])],
]);

function matchesWidget(instance, node, sourceWidget) {
  const props = instance.props;
  const attrs = instance.attrs;
  const widget = props?.widget ?? attrs?.widget;
  if (widget?.name !== sourceWidget.name || widget.type !== sourceWidget.type) return false;
  const owner = widget.node?.__v_raw ?? widget.node;
  if (owner ? owner !== node : String(props?.nodeId ?? attrs?.nodeId ?? attrs?.["node-id"]) !== String(node.id)) return false;
  if (sourceWidget.type === "boundingboxes") {
    return instance.subTree?.el?.matches?.('[data-testid="bounding-boxes"]') ?? false;
  }
  const type = instance.type;
  return viewportComponents.get(sourceWidget.type)?.has(type?.__name ?? type?.name) ?? false;
}

function findWidgetElement(root, node, widget) {
  const pending = [root];
  const visited = new Set();
  let found = null;
  while (pending.length && visited.size < 20000) {
    const vnode = pending.pop();
    if (!vnode || typeof vnode !== "object" || visited.has(vnode)) continue;
    visited.add(vnode);
    const instance = vnode.component;
    if (instance && !instance.isUnmounted) {
      const element = instance.subTree?.el;
      if (element?.nodeType === 1 && matchesWidget(instance, node, widget)) {
        if (found && found !== element) return null;
        found = element;
      }
      pending.push(instance.subTree);
    } else if (!instance) {
      if (Array.isArray(vnode.children)) pending.push(...vnode.children);
      pending.push(vnode.suspense?.activeBranch);
    }
  }
  return pending.length ? null : found;
}

export function installDomWidgetApi(app, host = window) {
  app.comfyGridDomWidgets?.dispose();
  let disposed = false;
  const api = {
    getWidgetElement(node, widget) {
      if (
        disposed ||
        (widget?.type !== "boundingboxes" && !viewportComponents.has(widget?.type)) ||
        !node?.widgets?.includes(widget) ||
        app.canvas?.graph?.getNodeById(node.id) !== node
      ) return null;

      const container = host.document.getElementById("vue-app");
      // Vue owns the component and its value bindings; only borrow its live root.
      return findWidgetElement(container?._vnode, node, widget);
    },
    dispose() {
      disposed = true;
      if (app.comfyGridDomWidgets === api) delete app.comfyGridDomWidgets;
    },
  };
  app.comfyGridDomWidgets = api;
  return api;
}
