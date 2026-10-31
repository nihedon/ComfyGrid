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
  const invalidated = new Map();
  const restoring = new Set();
  const finishWaits = new Set();
  let pendingRoot = app.rootGraph;
  let refreshing = null;

  function isLive(node, widget) {
    return node?.graph?.getNodeById(node.id) === node && node.widgets?.includes(widget);
  }

  function nextRender() {
    return new Promise((resolve, reject) => {
      let frame;
      let timer;
      const finish = () => {
        host.cancelAnimationFrame(frame);
        host.clearTimeout(timer);
        finishWaits.delete(finish);
        resolve();
      };
      finishWaits.add(finish);
      try {
        frame = host.requestAnimationFrame(finish);
        // Background tabs may suspend animation frames, but Vue still flushes microtasks.
        timer = host.setTimeout(finish, 100);
      } catch (error) {
        host.cancelAnimationFrame(frame);
        host.clearTimeout(timer);
        finishWaits.delete(finish);
        reject(error);
      }
    });
  }

  async function refreshInvalidated() {
    const entries = [...invalidated];
    for (const [widget] of entries) invalidated.delete(widget);
    const restores = [];
    const targets = [];
    let refreshed = 0;
    try {
      for (const [widget, node] of entries) {
        if (disposed || !isLive(node, widget)) continue;
        const element = api.getWidgetElement(node, widget);
        if (!element) continue;
        const suppression = widget.visibility?.suppression;
        // Use the canonical visibility state without changing registration options.
        if (!suppression || suppression.byExtension !== false) continue;
        targets.push({ widget, node, element });
        const restore = () => {
          suppression.byExtension = false;
          restoring.delete(restore);
        };
        restores.push(restore);
        restoring.add(restore);
        suppression.byExtension = true;
        refreshed++;
      }
      if (restores.length) await nextRender();
    } catch (error) {
      for (const [widget, node] of entries) if (!disposed && isLive(node, widget)) invalidated.set(widget, node);
      throw error;
    } finally {
      for (const restore of restores) restore();
    }
    if (restores.length && !disposed) await nextRender();
    let failed = false;
    for (const { widget, node, element } of targets) {
      if (!disposed && isLive(node, widget) && api.getWidgetElement(node, widget) === element) {
        invalidated.set(widget, node);
        failed = true;
      }
    }
    if (failed) throw new Error("ComfyUI bounding boxes view did not remount");
    return refreshed;
  }

  const api = {
    invalidateWidget(node, widget) {
      if (disposed || widget?.type !== "boundingboxes" || !isLive(node, widget)) return;
      if (pendingRoot !== app.rootGraph) {
        invalidated.clear();
        pendingRoot = app.rootGraph;
      }
      for (const [previous, owner] of invalidated) {
        if (!isLive(owner, previous)) invalidated.delete(previous);
      }
      invalidated.set(widget, node);
    },
    refreshInvalidatedWidgets() {
      if (disposed) return Promise.resolve(0);
      if (!refreshing) {
        refreshing = refreshInvalidated().finally(() => { refreshing = null; });
      }
      return refreshing;
    },
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
      invalidated.clear();
      for (const restore of restoring) restore();
      for (const finish of finishWaits) finish();
      if (app.comfyGridDomWidgets === api) delete app.comfyGridDomWidgets;
    },
  };
  app.comfyGridDomWidgets = api;
  return api;
}
