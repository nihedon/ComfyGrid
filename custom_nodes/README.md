# ComfyGrid Custom Extensions

Place third-party widget extensions here.

## Structure

```
custom_extensions/
  my-extension/
    manifest.json   <- Extension metadata and node matching rules
    widget.js       <- Vanilla JS Custom Element definition
```

## manifest.json

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "Optional description",
  "widgets": [
    {
      "match": { "comfy_class": "MyNodeClass" },
      "custom_element": "my-widget-element",
      "group_by": null
    }
  ],
  "ignore": []
}
```

### match fields (all optional, all must match if specified)

| Field | Matches |
|-------|---------|
| `comfy_class` | `node.comfyClass` |
| `constructor_name` | `node.type` |
| `widget_name` | `widget.name` |
| `widget_type` | `widget.type` |
| `class_name` | `widget.className` |

### group_by

When set to `"className"`, `"widgetName"`, or `"widgetType"`, multiple matching widgets
are grouped and the element receives `widget-indices` (JSON array) instead of `widget-index`.

## widget.js

```javascript
class MyWidget extends HTMLElement {
    #unsubscribe = null;

    connectedCallback() {
        const nodeId = Number(this.getAttribute('node-id'));
        const widgetIndex = Number(this.getAttribute('widget-index'));
        const api = window.__COMFYGRID_WIDGETS__;

        this.#render(api.getNode(nodeId), widgetIndex, api);
        this.#unsubscribe = api.subscribe(nodeId, (node) => {
            this.#render(node, widgetIndex, api);
        });
    }

    disconnectedCallback() {
        this.#unsubscribe?.();
    }

    #render(node, widgetIndex, api) {
        // Build your UI here
    }
}

customElements.define('my-widget-element', MyWidget);
```

## Available API: `window.__COMFYGRID_WIDGETS__`

```typescript
interface ComfyGridWidgetApi {
    getNode(nodeId: number): Node | undefined;
    send(event: string, payload: unknown): void;
    subscribe(nodeId: number, callback: (node: Node) => void): () => void;
    getModels(category?: string): Model[];
}
```

## ComfyUI Bridge: `window.__COMFYGRID_BRIDGE__`

To handle `comfygrid.command.update_node` in ComfyUI, place a `bridge.js` in your
ComfyUI custom node's `web/` directory. It will be loaded automatically by ComfyUI.

```javascript
// ComfyUI/custom_nodes/my-ext/web/bridge.js
const api = window.__COMFYGRID_BRIDGE__;
if (api) {
    api.registerNodeUpdater('MyNodeClass', (node, action, data, ctx) => {
        if (action === 'myAction') {
            // Manipulate ComfyUI node directly
            node.setDirtyCanvas(true, true);
        }
    });
}
```
