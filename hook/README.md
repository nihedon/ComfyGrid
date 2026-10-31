# ComfyGrid Workflow API

The embedded extension exposes `app.comfyGridWorkflows` (API version 1).
ComfyGrid accesses it through `ComfyUiBridge` without switching ComfyUI tabs.

```ts
bridge.getOpenWorkflows(); // Path, name, selected, modified and loaded state
await bridge.selectWorkflow("workflows/folder/example.json"); // Select an open tab
await bridge.saveWorkflow((name) => prompt("Workflow filename:", name));
await bridge.getOpenWorkflowSnapshots(); // All open workflows, including JSON
await bridge.getOpenWorkflowSnapshots(["workflows/folder/example.json"]);
bridge.captureWorkflow(); // Capture the currently displayed root graph
bridge.getWorkflowCapture("workflows/folder/example.json");
```

- Paths are ComfyUI workflow paths, including the `workflows/` prefix. A graph
  UUID alone is not a tab identifier: multiple tabs can contain the same UUID.
- Active JSON is serialized from the root graph; inactive JSON comes from the
  workflow's tracked state. Restored tabs load their saved data without activation.
  Each result includes either a detached JSON copy or an `error` with `json: null`.
- The top workflow menu lists these descriptors and switches by path through
  `selectWorkflow`, without searching or clicking ComfyUI DOM elements. Selection
  follows ComfyUI's native loading arguments, including its workflow object, to
  retain unsaved edits and restore the tab's viewport and navigation state.
- Ctrl+Shift+S in ComfyGrid saves through ComfyUI's workflow store, not a JSON
  download. Temporary workflows ask for a name in the parent page; existing
  workflows save to their current path. New workflows cannot take another
  workflow's name. One capture is frozen before persistence and returned with the
  saved workflow path; ComfyGrid saves that thumbnail only after the workflow save
  succeeds. Thumbnail failures are reported separately from workflow failures.
  Ctrl+S continues to save the selected gallery image.
- Captures use the actual graph canvas, not a minimap. The viewport is restored
  synchronously after fitting and copying the graph. Subgraph-only views are not
  cached as root workflow images.
- Hidden workflows return their last cached capture, or `null` if none exists.
  Captures include `capturedAt`, `graphId`, `revision`, and `stale`; callers must
  not interpret an old capture as a new rendering of an inactive workflow.
- Captures are taken only when explicitly requested. ComfyGrid requests one after
  loading a workflow from Files > Workflows, and when saving with Ctrl+Shift+S.
  Initialization, editing, execution and tab switching do not take captures.
  The cache is limited to 20 entries and 12 MiB of image strings. Closed tabs and
  iframe teardown release their entries and listeners.
- The wrapper around `loadGraphData` only tracks whether loading is in progress;
  it does not change loading arguments, activate tabs, or modify workflow JSON.
  ComfyUI's workflow store is feature-dependent and should be checked when
  upgrading ComfyUI.

The hook directory is copied into ComfyUI during profile startup from Setup.
After editing these files, stop ComfyUI and start the profile from Setup to
install the updated extension. Reloading only ComfyGrid does not copy the hook.
