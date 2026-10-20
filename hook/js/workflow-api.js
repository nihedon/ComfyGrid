import { captureGraph } from "./workflow-capture.js";

const MAX_CAPTURES = 20;
const MAX_CAPTURE_BYTES = 12 * 1024 * 1024;

function revisionOf(json) {
  const text = JSON.stringify(json);
  let first = 2166136261;
  let second = 5381;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${text.length}:${first >>> 0}:${second >>> 0}`;
}

export function installWorkflowApi(app, host = window) {
  app.comfyGridWorkflows?.dispose();
  const captures = new Map();
  let bytes = 0;
  let disposed = false;
  let loading = 0;
  let generation = 0;
  let stable = true;
  let selecting = false;
  let unsubscribe;
  let subscribedStore;
  const originalLoad = app.loadGraphData;
  const store = () => app.extensionManager?.workflow;
  const workflows = () => store()?.openWorkflows ?? [];
  const active = () => store()?.activeWorkflow;

  function remove(workflow) {
    bytes -= (captures.get(workflow)?.dataUrl.length ?? 0) * 2;
    captures.delete(workflow);
  }

  function prune() {
    const open = new Set(workflows());
    for (const workflow of captures.keys()) {
      if (!open.has(workflow)) remove(workflow);
    }
  }

  function connectStore() {
    const current = store();
    if (current === subscribedStore) return;
    unsubscribe?.();
    subscribedStore = current;
    unsubscribe = current?.$subscribe?.(prune, { detached: true });
  }

  function describe(workflow) {
    return {
      path: workflow.path,
      name: workflow.filename ?? workflow.path.split("/").pop(),
      selected: workflow === active(),
      isModified: Boolean(workflow.isModified),
      isLoaded: Boolean(workflow.isLoaded),
    };
  }

  function stateOf(workflow) {
    if (workflow === active()) {
      if (loading || !stable)
        throw new Error("Workflow is being loaded or failed to load");
      const graph = app.rootGraph ?? app.graph;
      return graph?.serialize();
    }
    return workflow.activeState;
  }

  function find(path) {
    return workflows().find((workflow) => workflow.path === path);
  }

  function captureWorkflow(path = active()?.path) {
    if (disposed || loading || !stable) return null;
    connectStore();
    prune();
    const workflow = find(path);
    if (!workflow || workflow !== active()) return getWorkflowCapture(path);
    try {
      const dataUrl = captureGraph(app);
      if (!dataUrl || workflow !== active() || loading) return null;
      const json = stateOf(workflow);
      if (!json) return null;
      const capture = {
        path: workflow.path,
        graphId: json.id ?? null,
        revision: revisionOf(json),
        capturedAt: Date.now(),
        dataUrl,
        stale: false,
      };
      remove(workflow);
      captures.set(workflow, capture);
      bytes += dataUrl.length * 2;
      while (captures.size > MAX_CAPTURES || bytes > MAX_CAPTURE_BYTES) {
        remove(captures.keys().next().value);
      }
      return { ...capture };
    } catch (error) {
      console.warn("ComfyGrid: unable to capture workflow", error);
      return null;
    }
  }

  function getWorkflowCapture(path) {
    if (disposed) return null;
    prune();
    const workflow = find(path);
    const capture = captures.get(workflow);
    if (!capture) return null;
    let stale = true;
    try {
      const json =
        (loading || !stable) && workflow === active()
          ? null
          : stateOf(workflow);
      stale = !json || revisionOf(json) !== capture.revision;
    } catch {
      // An unserializable graph cannot validate an earlier capture.
    }
    // A cache hit is not a fresh screenshot of a hidden/changed workflow.
    return {
      ...capture,
      path: workflow.path,
      stale,
    };
  }

  // Configure hooks run before ComfyUI updates activeWorkflow. Observe the whole
  // load operation to reject explicit captures while the tab identity is unstable.
  async function loadGraphData(...args) {
    const operation = ++generation;
    stable = false;
    loading++;
    try {
      const result = await originalLoad.apply(this, args);
      stable = operation === generation && loading === 1;
      return result;
    } finally {
      loading--;
    }
  }

  const api = {
    version: 1,
    listWorkflows() {
      if (disposed) return [];
      connectStore();
      prune();
      return workflows().map(describe);
    },
    async selectWorkflow(path) {
      if (disposed)
        throw new Error("ComfyGrid workflow extension is unavailable");
      if (loading || selecting)
        throw new Error("Workflow switch is already in progress");
      const workflow = find(path);
      if (!workflow) throw new Error("Workflow tab is no longer open");
      if (workflow === active()) return;
      const operation = generation;
      const loadFromRemote = !workflow.isLoaded;
      selecting = true;
      try {
        if (loadFromRemote) await workflow.load();
        if (disposed || find(path) !== workflow)
          throw new Error("Workflow tab is no longer open");
        if (loading || generation !== operation)
          throw new Error("Workflow changed while switching tabs");
        if (!workflow.activeState)
          throw new Error("Workflow data is unavailable");
        // Match ComfyUI's native tab switch. Passing the workflow object preserves
        // its tab identity, change tracker, viewport and subgraph navigation state.
        await app.loadGraphData(
          JSON.parse(JSON.stringify(workflow.activeState)),
          true,
          true,
          workflow,
          {
            showMissingModelsDialog: loadFromRemote,
            showMissingNodesDialog: loadFromRemote,
            checkForRerouteMigration: false,
          },
        );
        if (disposed || active() !== workflow)
          throw new Error("Workflow tab could not be selected");
      } finally {
        selecting = false;
      }
    },
    async getWorkflows(paths) {
      if (disposed) return [];
      if (!store()?.openWorkflows)
        throw new Error("ComfyUI workflow store is unavailable");
      const requested = workflows().filter(
        (workflow) => !paths || paths.includes(workflow.path),
      );
      const result = [];
      for (const workflow of requested) {
        const info = describe(workflow);
        try {
          if (!workflow.isLoaded) await workflow.load();
          if (disposed || !workflows().includes(workflow)) continue;
          const state = stateOf(workflow);
          if (!state) throw new Error("Workflow data is unavailable");
          // Vue proxies and tracker objects must not escape into ComfyGrid.
          const json = JSON.parse(JSON.stringify(state));
          result.push({
            ...describe(workflow),
            json,
            revision: revisionOf(json),
          });
        } catch (error) {
          result.push({
            ...info,
            json: null,
            revision: null,
            error: String(error?.message ?? error),
          });
        }
      }
      return disposed ? [] : result;
    },
    captureWorkflow,
    getWorkflowCapture,
    dispose() {
      if (disposed) return;
      disposed = true;
      host.removeEventListener("pagehide", api.dispose);
      unsubscribe?.();
      captures.clear();
      bytes = 0;
      if (app.loadGraphData === loadGraphData) app.loadGraphData = originalLoad;
      if (app.comfyGridWorkflows === api) delete app.comfyGridWorkflows;
    },
  };
  app.loadGraphData = loadGraphData;
  app.comfyGridWorkflows = api;
  host.addEventListener("pagehide", api.dispose);
  connectStore();
  return api;
}
