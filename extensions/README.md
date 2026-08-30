# ComfyGrid Extension Development Guide

ComfyGrid extensions allow you to customize and enhance node widgets, buttons, and UI components using modern Web Standards (HTML Templates + Web Components).

---

## 📁 Directory Structure

An extension is placed in a subfolder under `extensions/`:

```text
extensions/
  └── your-extension-name/
        ├── manifest.json      # Extension metadata and widget routing (Required)
        ├── style.css          # Optional stylesheets
        ├── template.html      # HTML templates
        └── widget.js          # Widget logic (Web Components)
```

---

## 1. `manifest.json`

Define metadata and map target ComfyUI widgets to your Custom Elements:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Custom widget extension for ComfyGrid",
  "frontend": {
    "scripts": ["widget.js"],
    "styles": ["style.css"]
  },
  "widgets": [
    {
      "match": { "widget_class_name": "MyCustomComfyWidget" },
      "custom_element": "my-custom-widget"
    }
  ]
}
```

### Match Rules

You can match widgets by:

- `widget_class_name`: Class name of the ComfyUI widget (e.g. `"PowerLoraLoaderWidget"`)
- `widget_name`: Name property of the widget (e.g. `"seed"`)
- `widget_type`: Type of the widget (e.g. `"combo"`, `"custom"`)
- `node_type`: ComfyUI node type name
- `comfy_class`: Python class name of the node

---

## 2. Declarative HTML Template (`template.html`)

You can build widgets declaratively using automatic attributes:

```html
<template id="my-custom-widget">
  <div class="d-flex align-items-center gap-2">
    <!-- Drag handle for sortable lists -->
    <span class="cg-sort-handle"><i class="icon-grip-horizontal"></i></span>

    <!-- Two-way data binding (bind="path.to.value") -->
    <input class="form-check-input" type="checkbox" bind="value.on" />
    <input class="form-control" type="number" step="0.1" bind="value.strength" />

    <!-- Built-in Model Select Combo -->
    <cg-modal-combo-widget bind="value.model" model-dir="models" model-subdirs="loras" />

    <!-- Built-in Action Buttons -->
    <button class="btn btn-sm btn-danger" action="remove"><i class="icon-x"></i></button>
  </div>
</template>
```

### Built-in Attributes

- **`bind="path"`**: Automatically binds `<input>`, `<select>`, `<textarea>`, or `<cg-modal-combo-widget>` to `widget.value.<path>` with two-way sync.
- **`action="remove"`**: Automatically deletes this widget from its parent node when clicked.
- **`.cg-sort-handle`**: Marks the drag handle element when `static sortable = true` is enabled.

---

## 3. Widget Class (`widget.js`)

Inherit from `ComfyGridWidget` to get zero-boilerplate lifecycle management, auto-binding, and Sortable drag-and-drop:

```javascript
class MyCustomWidget extends (globalThis.ComfyGridWidget || HTMLElement) {
  static extension = "my-extension"; // Extension folder name
  static template = "template.html#my-custom-widget"; // Template file and ID
  static sortable = true; // Enable drag-and-drop reordering

  /**
   * Called when DOM template is loaded and mounted.
   */
  onInit() {
    // Custom setup if needed
  }

  /**
   * Called when user changes a bound value via UI.
   */
  onValueChange(path, value) {
    if (path === "value.model") {
      this.comfyWidget?.setLora?.(value);
    }
  }

  /**
   * Called when external values are synced from ComfyUI.
   */
  onSync(value) {
    // Additional custom UI sync if needed
  }
}

customElements.define("my-custom-widget", MyCustomWidget);
```

### Available Properties & Methods on `ComfyGridWidget`

- `this.widget`: ComfyGrid widget instance
- `this.node`: Parent ComfyGrid node instance
- `this.comfyNode`: Underlying ComfyUI LiteGraph node instance
- `this.comfyWidget`: Underlying ComfyUI widget instance
- `this.setValue(path, value, silent = true)`: Update a value and save to ComfyUI
- `this.save(silent = true)`: Trigger node graph update
- `this.removeSelf()`: Remove widget from node

---

## 4. Built-in ComfyGrid Custom Elements

You can embed these standard ComfyGrid elements directly into your templates:

- **`<cg-button-widget>`**: Standard Bootstrap styled button.

  ```html
  <cg-button-widget label="Click Me" variant="primary"></cg-button-widget>
  ```

- **`<cg-modal-combo-widget>`**: Autocomplete model selection with popup modal support.

  ```html
  <cg-modal-combo-widget model-dir="models" model-subdirs="checkpoints"></cg-modal-combo-widget>
  ```

- **`<cg-toggle-widget>`**: Switch-styled checkbox toggle.

  ```html
  <cg-toggle-widget label="Bypass"></cg-toggle-widget>
  ```
