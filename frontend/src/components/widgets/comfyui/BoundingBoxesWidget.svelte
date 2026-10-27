<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    ClipboardPaste,
    Copy,
    Grid3x3,
    Group,
    Image as ImageIcon,
    ListX,
    Magnet,
    Plus,
    Redo2,
    Trash2,
    Undo2,
    X,
  } from '@lucide/svelte';
  import JsonEditor from '@/components/common/JsonEditor.svelte';
  import { t } from '@/i18n/i18n';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';
  import BoundingBoxGeometry from './features/BoundingBoxGeometry.svelte';
  import BoundingBoxList from './features/BoundingBoxList.svelte';
  import BoundingBoxTextEditor from './features/BoundingBoxTextEditor.svelte';
  import {
    type BoundingBox,
    type BoxGeometryField,
    type BoxHandle,
    type BoxSelectionClick,
    boxHits,
    boxNumberTextColor,
    boxTypeFromText,
    boxesFromClipboard,
    boxesFromJson,
    boxesToClipboard,
    boxesToJson,
    canCycleBoxes,
    clamp,
    cloneBoxes,
    dragBox,
    emptyBox,
    moveBoxes,
    nextBoxHit,
    readBoxes,
    resizeBoxGroup,
    scaleBoxes,
    selectedBoxBounds,
    snapBoxCoordinate,
  } from './features/bounding-boxes';

  let {
    widget,
    options,
  }: {
    widget: ComfyGridWidget<BoundingBox[]>;
    options?: { isFloating?: boolean; fitDomToNode?: boolean };
  } = $props();
  const nativeNode = $derived(widget.node.comfyNode);
  const nativeWidget = $derived(widget.comfyWidget);
  const readonly = $derived(widget.readonly || nativeWidget.disabled);
  const fit = $derived(!!options?.isFloating && !!options?.fitDomToNode);
  const uid = $props.id();
  let boxes = $state<BoundingBox[]>([]);
  let selected = $state(-1);
  let selection = $state<number[]>([]);
  let selectionAnchor = -1;
  let width = $state(1024);
  let height = $state(1024);
  let grid = $state(true);
  let snap = $state(true);
  let groupResize = $state(true);
  let galleryReference = $state(false);
  let referenceOpacity = $state(50);
  const galleryBackground = $derived.by(() => {
    if (!galleryReference) return '';
    const gallery = appState.galleryState;
    const node = gallery.currentGalleryNode;
    if (node?.assets?.isVideo) return '';
    return (
      node?.assets?.originalCompare?.[gallery.selectedCompareIndex] ||
      node?.assets?.originalSingle ||
      node?.previewUrl ||
      ''
    );
  });
  let view = $state<'bbox' | 'json'>('bbox');
  let jsonText = $state('');
  let jsonError = $state('');
  let jsonSource = '';
  let jsonEditing = false;
  let background = $state('');
  let backgroundOutput: unknown;
  let savedSource: unknown;
  let imageLoader: HTMLImageElement | null = null;
  let loadingBackground = false;
  let past = $state<BoundingBox[][]>([]);
  let future = $state<BoundingBox[][]>([]);
  let svg = $state<SVGSVGElement>();
  let root: HTMLDivElement;
  let description = $state<{ focus: () => void }>();
  let lastValue = '';
  let lastSelectionClick: BoxSelectionClick | null = null;
  let editStart: BoundingBox[] | null = null;
  let marquee = $state<{ x: number; y: number; width: number; height: number } | null>(null);
  let gesture: {
    pointerId: number;
    x: number;
    y: number;
    index: number;
    handle: BoxHandle | 'create' | 'select';
    before: BoundingBox[];
    clientX: number;
    clientY: number;
    moved: boolean;
    clickIndex?: number;
    selectionBefore: number[];
    primaryBefore: number;
    dragIndices: number[];
    toggleIndex?: number;
    duplicate?: boolean;
    moveSource?: BoundingBox[];
    shiftClick?: boolean;
    moveIndex?: number;
    moveIndices?: number[];
    lastPointer?: PointerEvent;
    resizeAsGroup?: boolean;
  } | null = null;
  const active = $derived(boxes[selection[0]]);
  const groupBounds = $derived(
    !snap && groupResize && selection.length > 1 ? selectedBoxBounds(boxes, selection) : null,
  );

  function selectOnly(index: number) {
    selected = index;
    selection = index < 0 ? [] : [index];
    selectionAnchor = index;
  }

  function selectFromList(index: number, additive: boolean, range: boolean) {
    if (readonly || gesture) return;
    finishEdit();
    if (range) {
      const anchor = selectionAnchor >= 0 ? selectionAnchor : selected >= 0 ? selected : index;
      selectionAnchor = anchor;
      const start = Math.min(anchor, index),
        end = Math.max(anchor, index);
      const indices = boxes.flatMap((_, i) => (i >= start && i <= end ? [i] : []));
      const retained = additive ? selection : selection.filter((i) => indices.includes(i));
      selection = [...retained, ...indices.filter((i) => !retained.includes(i))];
      selected = index;
    } else if (additive) {
      selection = selection.includes(index)
        ? selection.filter((item) => item !== index)
        : [...selection, index];
      selected = selection.includes(index) ? index : (selection.at(-1) ?? -1);
      selectionAnchor = index;
    } else selectOnly(index);
    lastSelectionClick = null;
  }

  function reorder(from: number, to: number) {
    if (
      readonly ||
      gesture ||
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= boxes.length ||
      to >= boxes.length
    )
      return;
    finishEdit();
    const moving = selection.includes(from) ? selection : [from];
    if (moving.includes(to)) return;
    const before = cloneBoxes(boxes);
    const indices = boxes.map((_, index) => index);
    const group = indices.filter((index) => moving.includes(index));
    const order = indices.filter((index) => !moving.includes(index));
    const insertion = order.indexOf(to) + (from < to ? 1 : 0);
    order.splice(insertion, 0, ...group);
    boxes = order.map((index) => boxes[index]);
    selection = selection.map((index) => order.indexOf(index));
    selected = order.indexOf(selected);
    selectionAnchor = order.indexOf(selectionAnchor);
    lastSelectionClick = null;
    remember(before);
  }
  const handles: [BoxHandle, number, number][] = [
    ['nw', 0, 0],
    ['n', 0.5, 0],
    ['ne', 1, 0],
    ['e', 1, 0.5],
    ['se', 1, 1],
    ['s', 0.5, 1],
    ['sw', 0, 1],
    ['w', 0, 0.5],
  ];

  function dimension(name: string) {
    const value = Number(nativeNode.widgets.find((item) => item.name === name)?.value);
    return Number.isFinite(value) && value > 0 ? value : 1024;
  }

  function imageUrl(images: unknown): string {
    if (!Array.isArray(images) || !images[0]) return '';
    const image = images[0];
    if (typeof image.filename !== 'string') return '';
    const base = appState.comfyUiState.window?.location.href;
    if (!base) return '';
    // This URL is only a temporary builder, not reactive UI state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const url = new URL('view', base);
    url.search = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? '',
      type: image.type ?? 'output',
    }).toString();
    return url.href;
  }

  function syncSources() {
    const app = appState.comfyUiState.window?.comfyAPI?.app?.app as
      | {
          nodeOutputs?: Record<string, Record<string, unknown>>;
          nodePreviewImages?: Record<string, string[]>;
        }
      | undefined;
    const output = app?.nodeOutputs?.[String(nativeNode.id)];
    const input = nativeNode.inputs?.findIndex((slot) => slot.name === 'background') ?? -1;
    let source = input >= 0 ? nativeNode.getInputNode(input) : null;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const visited = new Set<unknown>();
    while (source && source.type === 'Reroute' && !visited.has(source)) {
      visited.add(source);
      source = source.getInputNode(0);
    }
    if (backgroundOutput !== output?.background_images) {
      backgroundOutput = output?.background_images;
      savedSource = source;
    }
    const nextBackground = source
      ? app?.nodePreviewImages?.[String(source.id)]?.[0] ||
        imageUrl(app?.nodeOutputs?.[String(source.id)]?.images) ||
        (savedSource === source ? imageUrl(backgroundOutput) : '')
      : '';
    if (background !== nextBackground) {
      background = nextBackground;
      if (imageLoader) {
        imageLoader.onload = null;
        imageLoader.onerror = null;
      }
      loadingBackground = !!background;
      if (background) {
        const loader = new Image();
        imageLoader = loader;
        loader.onerror = () => {
          loadingBackground = false;
        };
        loader.onload = () => {
          loadingBackground = false;
          for (const name of ['width', 'height'] as const) {
            const value = Math.max(
              16,
              Math.round((name === 'width' ? loader.naturalWidth : loader.naturalHeight) / 16) * 16,
            );
            const sibling = nativeNode.widgets.find((item) => item.name === name);
            if (!sibling || sibling.value === value) continue;
            sibling.value = value;
            sibling.callback?.(value);
            const wrapper = widget.node.widgets.find((item) => item.name === name);
            if (wrapper) (wrapper as unknown as ComfyGridWidget<number>).value = value;
          }
        };
        loader.src = background;
      }
    }
    const connected = nativeNode.inputs?.some(
      (slot) => slot.name === 'bboxes' && slot.link != null,
    );
    const incoming = connected ? readBoxes(output?.input_bboxes) : null;
    const lastIncoming = nativeNode.widgets.find((item) => item.name === 'last_incoming');
    if (
      !loadingBackground &&
      incoming?.length &&
      lastIncoming &&
      JSON.stringify(incoming) !== JSON.stringify(lastIncoming.value)
    ) {
      boxes = incoming;
      lastIncoming.value = cloneBoxes(incoming);
      past = [];
      future = [];
      selectOnly(-1);
      lastSelectionClick = null;
      publish();
    }
  }

  function publish() {
    const value = cloneBoxes(boxes);
    lastValue = JSON.stringify(value);
    widget.value = value;
    widget.updateValue();
    if (!nativeWidget.setValue) nativeWidget.callback?.(value);
    appState.comfyUiState.window?.comfyAPI?.app?.app?.comfyGridDomWidgets?.invalidateWidget?.(
      nativeNode,
      nativeWidget,
    );
    widget.onDrawBackground();
    nativeNode.graph?.setDirtyCanvas(true, true);
  }

  function typesDiffer(value: unknown, parsed: BoundingBox[]) {
    return (
      Array.isArray(value) &&
      value.some((box, index) => box?.metadata?.type !== parsed[index]?.metadata.type)
    );
  }

  function remember(before: BoundingBox[]) {
    if (JSON.stringify(before) === JSON.stringify(boxes)) return;
    past = [...past.slice(-99), cloneBoxes(before)];
    future = [];
    publish();
  }

  function finishEdit() {
    if (!editStart) return;
    const before = editStart;
    editStart = null;
    remember(before);
  }

  function refreshJson() {
    const source = JSON.stringify(boxes);
    if (source === jsonSource) return;
    jsonSource = source;
    jsonText = JSON.stringify(boxesToJson(boxes), null, 2);
    jsonError = '';
  }

  function switchView(next: 'bbox' | 'json') {
    if (gesture) return;
    finishEdit();
    jsonEditing = false;
    if (next === 'json') refreshJson();
    view = next;
  }

  function editJson() {
    if (readonly) return;
    let next: BoundingBox[] | null;
    try {
      next = boxesFromJson(JSON.parse(jsonText));
    } catch {
      jsonError = '';
      return; // JsonEditor displays syntax errors and keeps the unfinished draft.
    }
    if (!next || next.some((box) => box.width <= 0 || box.height <= 0)) {
      jsonError = $t('bbox.invalid_json');
      return;
    }
    jsonError = '';
    jsonText = JSON.stringify(boxesToJson(next), null, 2);
    const source = JSON.stringify(next);
    if (source === JSON.stringify(boxes)) return;
    editStart ??= cloneBoxes(boxes);
    boxes = next;
    jsonSource = source;
    selectOnly(-1);
    lastSelectionClick = null;
    publish();
  }

  function editMetadata(change: Partial<BoundingBox['metadata']>) {
    if (readonly || !active) return;
    if (
      Object.entries(change).every(
        ([key, value]) =>
          JSON.stringify(active.metadata[key as keyof BoundingBox['metadata']]) ===
          JSON.stringify(value),
      )
    )
      return;
    editStart ??= cloneBoxes(boxes);
    boxes = boxes.map((box, index) =>
      selection.includes(index)
        ? {
            ...box,
            metadata: {
              ...box.metadata,
              ...change,
              type: boxTypeFromText(change.text ?? box.metadata.text),
            },
          }
        : box,
    );
    publish();
  }

  function editGeometry(field: BoxGeometryField, value: number) {
    if (readonly || gesture || !selection.length || !Number.isFinite(value)) return;
    finishEdit();
    const before = cloneBoxes(boxes);
    const minimum = field === 'width' || field === 'height' ? 1 : 0;
    const maximum = field === 'width' ? width : field === 'height' ? height : Infinity;
    const nextValue = clamp(value, minimum, Math.max(minimum, maximum));
    boxes = boxes.map((box, index) => {
      if (!selection.includes(index)) return box;
      return { ...box, [field]: nextValue };
    });
    lastSelectionClick = null;
    remember(before);
  }

  function addBox() {
    if (readonly || gesture) return;
    finishEdit();
    const before = cloneBoxes(boxes);
    const boxWidth = snap
      ? snapBoxCoordinate(width / 4, width) || Math.min(32, width)
      : Math.max(1, Math.round(width / 4));
    const boxHeight = snap
      ? snapBoxCoordinate(height / 4, height) || Math.min(32, height)
      : Math.max(1, Math.round(height / 4));
    const x = clamp(
      snap ? snapBoxCoordinate((width - boxWidth) / 2, width) : Math.round((width - boxWidth) / 2),
      0,
      width - boxWidth,
    );
    const y = clamp(
      snap
        ? snapBoxCoordinate((height - boxHeight) / 2, height)
        : Math.round((height - boxHeight) / 2),
      0,
      height - boxHeight,
    );
    const insertion = selection.length ? Math.max(...selection) + 1 : boxes.length;
    boxes = [
      ...boxes.slice(0, insertion),
      { ...emptyBox(x, y), width: boxWidth, height: boxHeight },
      ...boxes.slice(insertion),
    ];
    selectOnly(insertion);
    lastSelectionClick = null;
    remember(before);
  }

  function remove(all = false) {
    if (readonly || gesture) return;
    finishEdit();
    const before = cloneBoxes(boxes);
    boxes = all ? [] : boxes.filter((_, index) => !selection.includes(index));
    selectOnly(-1);
    lastSelectionClick = null;
    if (all) {
      const incoming = nativeNode.widgets.find((item) => item.name === 'last_incoming');
      if (incoming) incoming.value = [];
    }
    remember(before);
  }

  function undo(redo = false) {
    if (readonly || gesture) return;
    finishEdit();
    const source = redo ? future : past;
    if (!source.length) return;
    const current = cloneBoxes(boxes);
    boxes = cloneBoxes(source[source.length - 1]);
    if (redo) {
      future = future.slice(0, -1);
      past = [...past, current];
    } else {
      past = past.slice(0, -1);
      future = [...future, current];
    }
    selectOnly(-1);
    lastSelectionClick = null;
    publish();
  }

  function point(event: PointerEvent) {
    const matrix = svg?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: clamp(p.x, 0, width), y: clamp(p.y, 0, height) };
  }

  function down(event: PointerEvent, index?: number, handle: BoxHandle = 'move') {
    if (readonly || event.button !== 0 || gesture) return;
    const p = point(event);
    if (!p) return;
    event.preventDefault();
    event.stopPropagation();
    finishEdit();
    svg?.focus();
    const selectionBefore = [...selection];
    const primaryBefore = selected;
    const toggle = event.ctrlKey || event.metaKey;
    const hits = boxHits(boxes, p.x, p.y);
    const nearestHit = hits[0];
    const additiveHit =
      hits.length > 1 &&
      lastSelectionClick !== null &&
      hits.includes(lastSelectionClick.index) &&
      canCycleBoxes(lastSelectionClick, lastSelectionClick.index, event.clientX, event.clientY)
        ? nextBoxHit(hits, lastSelectionClick.index)
        : nearestHit;
    const duplicate = toggle && handle === 'move' && selection.includes(nearestHit);
    if (
      (toggle && !duplicate) ||
      (event.shiftKey && handle === 'move' && nearestHit === undefined)
    ) {
      gesture = {
        pointerId: event.pointerId,
        x: p.x,
        y: p.y,
        index: -1,
        handle: 'select',
        before: cloneBoxes(boxes),
        clientX: event.clientX,
        clientY: event.clientY,
        moved: false,
        selectionBefore,
        primaryBefore,
        dragIndices: [],
        toggleIndex: additiveHit,
      };
      svg?.setPointerCapture(event.pointerId);
      return;
    }
    let clickIndex: number | undefined;
    if (handle === 'move') {
      if (duplicate) index = nearestHit;
      else if (hits.some((hit) => selection.includes(hit))) {
        index = hits.includes(selected) ? selected : hits.find((hit) => selection.includes(hit));
        clickIndex = canCycleBoxes(lastSelectionClick, selected, event.clientX, event.clientY)
          ? nextBoxHit(hits, selected)
          : hits[0];
      } else index = hits[0];
    }
    const before = cloneBoxes(boxes);
    if (index === undefined) {
      if (snap) {
        p.x = snapBoxCoordinate(p.x, width);
        p.y = snapBoxCoordinate(p.y, height);
      }
      index = boxes.length;
    }
    if (index < before.length && !selection.includes(index)) selectOnly(index);
    if (handle !== 'move') selected = index;
    gesture = {
      pointerId: event.pointerId,
      x: p.x,
      y: p.y,
      index,
      handle: index === before.length ? 'create' : handle,
      before,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
      clickIndex,
      selectionBefore,
      primaryBefore,
      dragIndices: [...selection],
      duplicate,
      toggleIndex: duplicate || (event.shiftKey && handle === 'move') ? additiveHit : undefined,
      shiftClick: event.shiftKey && handle === 'move',
      resizeAsGroup: !snap && groupResize && selection.length > 1 && handle !== 'move',
    };
    svg?.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture.lastPointer = event;
    if (
      !gesture.moved &&
      Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) < 3
    )
      return;
    gesture.moved = true;
    const p = point(event);
    if (!p) return;
    if (gesture.handle === 'select') {
      marquee = {
        x: Math.min(gesture.x, p.x),
        y: Math.min(gesture.y, p.y),
        width: Math.abs(p.x - gesture.x),
        height: Math.abs(p.y - gesture.y),
      };
      return;
    }
    if (gesture.handle === 'create' && boxes.length === gesture.before.length) {
      boxes = [...gesture.before, emptyBox(gesture.x, gesture.y)];
      selectOnly(gesture.index);
    }
    if (gesture.handle === 'move') {
      gesture.moveIndex ??= gesture.index;
      gesture.moveIndices ??= [...gesture.dragIndices];
      const originals = gesture.moveIndices;
      const duplicate = event.ctrlKey || event.metaKey;
      if (duplicate) {
        gesture.moveSource ??= [
          ...gesture.before,
          ...cloneBoxes(originals.map((index) => gesture!.before[index])),
        ];
        gesture.index = gesture.before.length + originals.indexOf(gesture.moveIndex);
        gesture.dragIndices = originals.map((_, index) => gesture!.before.length + index);
      } else {
        gesture.index = gesture.moveIndex;
        gesture.dragIndices = originals;
      }
      if (gesture.duplicate !== duplicate) {
        selection = [...gesture.dragIndices];
        selected = gesture.index;
      } else if (duplicate && selected !== gesture.index) {
        selection = [...gesture.dragIndices];
        selected = gesture.index;
      }
      gesture.duplicate = duplicate;
    }
    const moveSource = gesture.duplicate ? gesture.moveSource! : gesture.before;
    const base = moveSource[gesture.index];
    const moving = gesture.handle === 'move';
    const anchorX =
      gesture.handle === 'create'
        ? gesture.x
        : moving
          ? Math.min(...gesture.dragIndices.map((index) => moveSource[index].x))
          : base.x + (gesture.handle.includes('e') ? base.width : 0);
    const anchorY =
      gesture.handle === 'create'
        ? gesture.y
        : moving
          ? Math.min(...gesture.dragIndices.map((index) => moveSource[index].y))
          : base.y + (gesture.handle.includes('s') ? base.height : 0);
    // Snap the destination, so an off-grid starting position can recover on the next drag.
    const delta = (anchor: number, distance: number, size: number) =>
      snap ? snapBoxCoordinate(anchor + distance, size) - anchor : Math.round(distance);
    let dx = delta(anchorX, p.x - gesture.x, width),
      dy = delta(anchorY, p.y - gesture.y, height);
    if (gesture.handle === 'move' && event.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (gesture.handle === 'move' && gesture.dragIndices.length > 1) {
      boxes = moveBoxes(moveSource, gesture.dragIndices, dx, dy, width, height);
      return;
    }
    if (gesture.handle !== 'move' && gesture.handle !== 'create') {
      const handle = gesture.handle;
      const indices = gesture.dragIndices;
      if (gesture.resizeAsGroup) {
        boxes = resizeBoxGroup(gesture.before, indices, handle, dx, dy, width, height, {
          keepRatio: event.shiftKey,
          fromCenter: event.altKey,
        });
        return;
      }
      boxes = gesture.before.map((box, index) =>
        indices.includes(index)
          ? dragBox(box, handle, dx, dy, width, height, {
              keepRatio: event.shiftKey,
              fromCenter: event.altKey,
            })
          : box,
      );
      return;
    }
    let box: BoundingBox;
    if (gesture.handle === 'create') {
      if (event.shiftKey) {
        const sx = p.x < gesture.x ? -1 : 1;
        const sy = p.y < gesture.y ? -1 : 1;
        const side = Math.min(
          Math.max(Math.abs(dx), Math.abs(dy)),
          sx < 0 ? gesture.x : width - gesture.x,
          sy < 0 ? gesture.y : height - gesture.y,
        );
        dx = sx * side;
        dy = sy * side;
      }
      const x = clamp(gesture.x + dx, 0, width),
        y = clamp(gesture.y + dy, 0, height);
      box = {
        ...boxes[gesture.index],
        x: Math.round(Math.min(gesture.x, x)),
        y: Math.round(Math.min(gesture.y, y)),
        width: Math.round(Math.abs(x - gesture.x)),
        height: Math.round(Math.abs(y - gesture.y)),
      };
    } else
      box = dragBox(moveSource[gesture.index], gesture.handle, dx, dy, width, height, {
        keepRatio: event.shiftKey,
        fromCenter: event.altKey,
      });
    boxes = (gesture.handle === 'create' ? boxes : moveSource).map((item, i) =>
      i === gesture!.index ? box : item,
    );
  }

  function end(event: PointerEvent, cancel = false) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!cancel && gesture.moved && (gesture.handle === 'move' || gesture.handle === 'create'))
      move(event);
    const current = gesture;
    gesture = null;
    if (cancel) {
      boxes = current.before;
      selection = current.selectionBefore;
      selected = current.primaryBefore;
      lastSelectionClick = null;
    } else if (current.handle === 'create' && !current.moved) {
      selectOnly(-1);
      lastSelectionClick = null;
    } else if (current.shiftClick && !current.moved) {
      boxes = current.before;
      const index = current.toggleIndex;
      selection =
        index === undefined
          ? current.selectionBefore
          : current.selectionBefore.includes(index)
            ? current.selectionBefore.filter((item) => item !== index)
            : [...current.selectionBefore, index];
      selected =
        index !== undefined && selection.includes(index) ? index : (selection.at(-1) ?? -1);
      selectionAnchor = index ?? selected;
      lastSelectionClick =
        index !== undefined ? { index, clientX: event.clientX, clientY: event.clientY } : null;
    } else if (current.handle === 'select') {
      if (current.moved && marquee) {
        const area = marquee;
        const added = boxes.flatMap((box, index) =>
          !current.selectionBefore.includes(index) &&
          box.x >= area.x &&
          box.y >= area.y &&
          box.x + box.width <= area.x + area.width &&
          box.y + box.height <= area.y + area.height
            ? [index]
            : [],
        );
        selection = [...current.selectionBefore, ...added];
        selected = selection.includes(current.primaryBefore)
          ? current.primaryBefore
          : (selection.at(-1) ?? -1);
      } else if (!current.moved && current.toggleIndex !== undefined) {
        const index = current.toggleIndex;
        selection = current.selectionBefore.includes(index)
          ? current.selectionBefore.filter((item) => item !== index)
          : [...current.selectionBefore, index];
        selected = selection.includes(index) ? index : (selection.at(-1) ?? -1);
      }
      lastSelectionClick =
        !current.moved && current.toggleIndex !== undefined
          ? { index: current.toggleIndex, clientX: event.clientX, clientY: event.clientY }
          : null;
    } else {
      const box = boxes[current.index];
      if (
        current.handle === 'create' &&
        (box.width < width * 0.005 || box.height < height * 0.005)
      ) {
        boxes = current.before;
        selectOnly(-1);
      }
      remember(current.before);
      if (!current.moved && current.duplicate && current.toggleIndex !== undefined) {
        const index = current.toggleIndex;
        selection = current.selectionBefore.includes(index)
          ? current.selectionBefore.filter((item) => item !== index)
          : [...current.selectionBefore, index];
        selected = selection.includes(index) ? index : (selection.at(-1) ?? -1);
      } else if (!current.moved && current.handle === 'move') {
        selectOnly(current.clickIndex ?? current.index);
      }
      lastSelectionClick =
        !current.moved && current.handle === 'move'
          ? {
              index: current.duplicate ? current.toggleIndex! : selected,
              clientX: event.clientX,
              clientY: event.clientY,
            }
          : null;
    }
    selectionAnchor = selected;
    marquee = null;
    if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  }

  function updateDragModifiers(event: KeyboardEvent) {
    if (
      !gesture?.moved ||
      !gesture.lastPointer ||
      !(
        (gesture.handle === 'move' && ['Control', 'Meta'].includes(event.key)) ||
        (gesture.handle === 'create' && event.key === 'Shift')
      )
    )
      return;
    const pointer = gesture.lastPointer;
    move(
      new PointerEvent('pointermove', {
        pointerId: gesture.pointerId,
        clientX: pointer.clientX,
        clientY: pointer.clientY,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      }),
    );
  }

  let lastKeyboardMove: BoundingBox[] | null = null;

  function keyboard(event: KeyboardEvent) {
    const fromList =
      event.currentTarget instanceof HTMLButtonElement &&
      event.currentTarget.hasAttribute('data-box-index');
    if ((event.target !== svg && !fromList) || event.isComposing) return;
    const command = event.ctrlKey || event.metaKey;
    if (command && !event.altKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      if (gesture) return;
      finishEdit();
      const retained = selection.filter((index) => index < boxes.length);
      selection = [
        ...retained,
        ...boxes.flatMap((_, index) => (retained.includes(index) ? [] : [index])),
      ];
      selected = selection.includes(selected) ? selected : (selection[0] ?? -1);
      selectionAnchor = selected;
      lastSelectionClick = null;
    } else if (
      !command &&
      !event.altKey &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (readonly || gesture || !selection.length) return;
      finishEdit();
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const anchor = boxes[selection.includes(selected) ? selected : selection[0]];
      const coordinate = horizontal ? anchor.x : anchor.y;
      const size = horizontal ? width : height;
      const spacing = Math.max(32, Math.ceil(size / 64));
      const distance = snap
        ? (direction > 0
            ? Math.floor(coordinate / spacing) + 1
            : Math.ceil(coordinate / spacing) - 1) *
            spacing -
          coordinate
        : direction * (event.shiftKey ? 10 : 1);
      const before = boxes;
      const next = moveBoxes(
        boxes,
        selection,
        horizontal ? distance : 0,
        horizontal ? 0 : distance,
        width,
        height,
      );
      if (JSON.stringify(next) === JSON.stringify(before)) return;
      const continuing = event.repeat && lastKeyboardMove === before;
      boxes = next;
      lastSelectionClick = null;
      if (continuing) {
        future = [];
        publish();
      } else remember(before);
      lastKeyboardMove = boxes;
    } else if (command && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      event.stopPropagation();
      undo(event.shiftKey || event.key.toLowerCase() === 'y');
    } else if (['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      remove();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (gesture) {
        const current = gesture;
        boxes = current.before;
        gesture = null;
        if (svg?.hasPointerCapture(current.pointerId)) svg.releasePointerCapture(current.pointerId);
      }
      selectOnly(-1);
      marquee = null;
      lastSelectionClick = null;
    }
  }

  function copiedShapes() {
    return boxesToClipboard(boxes.filter((_, index) => selection.includes(index)));
  }

  function pasteShapes(text: string): boolean {
    if (readonly || gesture) return false;
    const added = boxesFromClipboard(text);
    if (!added) return false;
    finishEdit();
    const before = cloneBoxes(boxes);
    const start = boxes.length;
    boxes = [...boxes, ...added];
    selection = added.map((_, index) => start + index);
    selected = start;
    selectionAnchor = start;
    lastSelectionClick = null;
    remember(before);
    return true;
  }

  function copyShapes(event: ClipboardEvent) {
    if (event.target !== svg || gesture || !selection.length || !event.clipboardData) return;
    event.clipboardData.setData('text/plain', copiedShapes());
    event.preventDefault();
    event.stopPropagation();
  }

  function pasteShapesEvent(event: ClipboardEvent) {
    if (event.target !== svg || !event.clipboardData) return;
    // Keep other JSON from reaching the workflow importer while the canvas has focus.
    event.preventDefault();
    event.stopPropagation();
    pasteShapes(event.clipboardData.getData('text/plain'));
  }

  async function clipboardButton(copy: boolean) {
    if (gesture || (copy ? !selection.length : readonly)) return;
    try {
      if (copy) await navigator.clipboard.writeText(copiedShapes());
      else pasteShapes(await navigator.clipboard.readText());
    } catch {
      appState.toastState.addToast({ type: 'error', message: $t('bbox.clipboard_error') });
    }
  }

  async function focusDescription() {
    if (readonly || !active) return;
    await tick();
    description?.focus();
  }

  onMount(() => {
    window.addEventListener('keydown', updateDragModifiers);
    window.addEventListener('keyup', updateDragModifiers);
    width = dimension('width');
    height = dimension('height');
    grid = nativeNode.properties.bboxGrid !== false;
    snap =
      typeof nativeNode.properties.bboxSnap === 'boolean' ? nativeNode.properties.bboxSnap : grid;
    groupResize = nativeNode.properties.bboxGroupResize !== false;
    galleryReference = nativeNode.properties.bboxGalleryReference === true;
    const savedOpacity = nativeNode.properties.bboxReferenceOpacity;
    referenceOpacity =
      typeof savedOpacity === 'number' && Number.isFinite(savedOpacity)
        ? clamp(savedOpacity, 0, 100)
        : 30;
    const initial = readBoxes(nativeWidget.value);
    boxes = initial ?? [];
    lastValue = JSON.stringify(boxes);
    if (initial && typesDiffer(nativeWidget.value, initial)) publish();
    // Native widget values are not Svelte-reactive. Poll only this widget, without remounting its editor.
    const timer = window.setInterval(() => {
      if (gesture || editStart || jsonEditing || document.hidden || !root.getClientRects().length)
        return;
      const incoming = readBoxes(nativeWidget.value);
      const nextWidth = dimension('width'),
        nextHeight = dimension('height');
      if (
        incoming &&
        (JSON.stringify(incoming) !== lastValue || typesDiffer(nativeWidget.value, incoming))
      ) {
        boxes = incoming;
        lastSelectionClick = null;
        lastValue = JSON.stringify(incoming);
        widget.value = cloneBoxes(incoming);
        past = [];
        future = [];
        selectOnly(-1);
        if (typesDiffer(nativeWidget.value, incoming)) publish();
      } else if (nextWidth !== width || nextHeight !== height) {
        boxes = scaleBoxes(boxes, width, height, nextWidth, nextHeight);
        lastSelectionClick = null;
        past = [];
        future = [];
        publish();
      }
      width = nextWidth;
      height = nextHeight;
      syncSources();
      if (view === 'json') refreshJson();
    }, 200);
    return () => {
      window.removeEventListener('keydown', updateDragModifiers);
      window.removeEventListener('keyup', updateDragModifiers);
      window.clearInterval(timer);
      if (imageLoader) {
        imageLoader.onload = null;
        imageLoader.onerror = null;
      }
    };
  });
</script>

<div
  bind:this={root}
  class="bounding-boxes-widget"
  class:fit-node={fit}
  class:json-view={view === 'json'}
  class:fill-json={view === 'json' && !!options?.isFloating}
  style:--bbox-aspect={`${width} / ${height}`}
  data-id={widget.id}
  data-name={widget.name}
>
  <div class="nav nav-tabs flex-shrink-0" role="tablist" aria-label={$t('bbox.view')}>
    {#each ['bbox', 'json'] as tab (tab)}
      <button
        type="button"
        role="tab"
        class="nav-link"
        class:active={view === tab}
        id={`${uid}-tab-${tab}`}
        aria-selected={view === tab}
        aria-controls={`${uid}-panel`}
        onclick={() => switchView(tab as 'bbox' | 'json')}
        onkeydown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          const next =
            event.key === 'Home'
              ? 'bbox'
              : event.key === 'End'
                ? 'json'
                : view === 'bbox'
                  ? 'json'
                  : 'bbox';
          switchView(next);
          event.currentTarget.parentElement
            ?.querySelector<HTMLButtonElement>(`[id="${uid}-tab-${next}"]`)
            ?.focus();
        }}>{tab.toUpperCase()}</button
      >
    {/each}
  </div>
  <div
    class="bbox-tab-panel"
    role="tabpanel"
    id={`${uid}-panel`}
    aria-labelledby={`${uid}-tab-${view}`}
  >
    {#if view === 'bbox'}
      <div
        class="bbox-toolbar btn-toolbar gap-1 border rounded-top border-bottom-0 bg-light p-1 align-items-center"
      >
        <div class="bbox-tool-group" role="group" aria-label={$t('bbox.history')}>
          <button
            type="button"
            class="btn btn-xs btn-icon btn-secondary"
            title={$t('bbox.undo')}
            aria-label={$t('bbox.undo')}
            disabled={readonly || !past.length}
            onclick={() => undo()}><Undo2 size={12} /></button
          >
          <button
            type="button"
            class="btn btn-xs btn-icon btn-secondary"
            title={$t('bbox.redo')}
            aria-label={$t('bbox.redo')}
            disabled={readonly || !future.length}
            onclick={() => undo(true)}><Redo2 size={12} /></button
          >
        </div>
        <div class="bbox-tool-group" role="group" aria-label={$t('bbox.alignment')}>
          <button
            type="button"
            class="btn btn-xs btn-icon"
            class:btn-primary={grid}
            class:btn-secondary={!grid}
            title={$t('bbox.grid')}
            aria-label={$t('bbox.grid')}
            aria-pressed={grid}
            disabled={readonly}
            onclick={() => {
              if (gesture) return;
              grid = !grid;
              nativeNode.properties.bboxGrid = grid;
              nativeNode.properties.bboxSnap = snap;
            }}><Grid3x3 size={12} /></button
          >
          <button
            type="button"
            class="btn btn-xs btn-icon"
            class:btn-primary={snap}
            class:btn-secondary={!snap}
            title={$t('bbox.snap')}
            aria-label={$t('bbox.snap')}
            aria-pressed={snap}
            disabled={readonly}
            onclick={() => {
              if (gesture) return;
              snap = !snap;
              nativeNode.properties.bboxSnap = snap;
            }}><Magnet size={12} /></button
          >
          <button
            type="button"
            class="btn btn-xs btn-icon"
            class:btn-primary={groupResize}
            class:btn-secondary={!groupResize}
            title={$t('bbox.group_resize')}
            aria-label={$t('bbox.group_resize')}
            aria-pressed={groupResize}
            disabled={readonly || snap}
            onclick={() => {
              if (gesture) return;
              groupResize = !groupResize;
              nativeNode.properties.bboxGroupResize = groupResize;
            }}><Group size={12} /></button
          >
        </div>
        <div class="bbox-tool-group" role="group" aria-label={$t('bbox.gallery_reference')}>
          <button
            type="button"
            class="btn btn-xs btn-icon"
            class:btn-primary={galleryReference}
            class:btn-secondary={!galleryReference}
            title={$t('bbox.gallery_reference')}
            aria-label={$t('bbox.gallery_reference')}
            aria-pressed={galleryReference}
            onclick={() => {
              galleryReference = !galleryReference;
              nativeNode.properties.bboxGalleryReference = galleryReference;
            }}><ImageIcon size={12} /></button
          >
          {#if galleryReference}
            <div class="bbox-opacity d-flex align-items-center gap-1">
              <label class="visually-hidden" for={`${uid}-opacity`}
                >{$t('bbox.reference_opacity')}</label
              >
              <input
                id={`${uid}-opacity`}
                class="form-range m-0"
                type="range"
                min="0"
                max="100"
                step="1"
                value={referenceOpacity}
                aria-valuetext={`${referenceOpacity}%`}
                oninput={(event) => {
                  referenceOpacity = Number(event.currentTarget.value);
                  nativeNode.properties.bboxReferenceOpacity = referenceOpacity;
                }}
              />
              <output class="small">{referenceOpacity}%</output>
            </div>
          {/if}
        </div>
        <div class="bbox-tool-group ms-auto" role="group" aria-label={$t('bbox.edit')}>
          <button
            type="button"
            class="btn btn-xs btn-icon btn-secondary"
            title={$t('bbox.copy')}
            aria-label={$t('bbox.copy')}
            disabled={!selection.length}
            onclick={() => clipboardButton(true)}><Copy size={12} /></button
          >
          <button
            type="button"
            class="btn btn-xs btn-icon btn-secondary"
            title={$t('bbox.paste')}
            aria-label={$t('bbox.paste')}
            disabled={readonly}
            onclick={() => clipboardButton(false)}><ClipboardPaste size={12} /></button
          >
          <button
            type="button"
            class="btn btn-xs btn-icon btn-secondary"
            title={$t('bbox.delete')}
            aria-label={$t('bbox.delete')}
            disabled={readonly || !selection.length}
            onclick={() => remove()}><Trash2 size={12} /></button
          >
          <button
            type="button"
            class="btn btn-xs btn-icon btn-secondary"
            title={$t('bbox.clear')}
            aria-label={$t('bbox.clear')}
            disabled={readonly || !boxes.length}
            onclick={() => remove(true)}><ListX size={12} /></button
          >
        </div>
      </div>
      <div class="bbox-workspace">
        <div
          class="bbox-viewport border rounded-bottom"
          style:aspect-ratio={`${width} / ${height}`}
        >
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The SVG is a keyboard-accessible drawing surface.) -->
          <svg
            bind:this={svg}
            viewBox={`0 0 ${width} ${height}`}
            role="application"
            aria-label={$t('bbox.canvas')}
            tabindex="0"
            onpointerdown={(e) => down(e)}
            onpointermove={move}
            onpointerup={(e) => end(e)}
            onpointercancel={(e) => end(e, true)}
            onlostpointercapture={(e) => end(e, true)}
            onkeydown={keyboard}
            oncopy={copyShapes}
            onpaste={pasteShapesEvent}
            ondblclick={focusDescription}
          >
            <defs
              ><pattern
                id={`${uid}-grid`}
                width={Math.max(32, Math.ceil(width / 64))}
                height={Math.max(32, Math.ceil(height / 64))}
                patternUnits="userSpaceOnUse"
                ><circle cx="2" cy="2" r="1.5" fill="currentColor" opacity=".65" /></pattern
              ></defs
            >
            <rect {width} {height} fill="var(--bs-tertiary-bg)" />
            {#if galleryBackground || background}<image
                href={galleryBackground || background}
                {width}
                {height}
                opacity={galleryBackground ? referenceOpacity / 100 : 0.75}
                pointer-events="none"
              />{/if}
            {#if grid}<rect
                {width}
                {height}
                fill={`url(#${uid}-grid)`}
                pointer-events="none"
              />{/if}
            {#each boxes as box, index (index)}
              <g
                onpointerdown={(e) => down(e, index)}
                role="presentation"
                data-selected={selection.includes(index)}
              >
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill={box.metadata.palette[0] || '#444444'}
                  fill-opacity=".18"
                  stroke={box.metadata.palette[0] || '#444444'}
                  stroke-width={selection.includes(index) ? 2 : 1}
                  vector-effect="non-scaling-stroke"
                  style:cursor={readonly ? 'default' : 'move'}
                />
                <svg
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  overflow="hidden"
                  pointer-events="none"
                >
                  {#if box.metadata.palette[0]}
                    <rect
                      class="bbox-color-header"
                      x="0"
                      y="0"
                      width={box.width}
                      height="16"
                      fill={box.metadata.palette[0]}
                    />
                  {/if}
                  <rect
                    class="bbox-number-background"
                    class:selected={selection.includes(index)}
                    x="0"
                    y="0"
                    width={String(index + 1).padStart(2, '0').length * 20 +
                      8 +
                      (box.metadata.type === 'text' ? 84 : 0)}
                    height="32"
                    rx="4"
                    fill={box.metadata.palette[0] || '#444444'}
                    vector-effect="non-scaling-stroke"
                  />
                  <text
                    class="bbox-number"
                    fill={boxNumberTextColor(box.metadata.palette[0] || '#444444')}
                    class:selected={selection.includes(index)}
                    x="8"
                    y="26"
                    font-size="28"
                    font-weight="600"
                    text-anchor="left"
                    >{String(index + 1).padStart(2, '0')}{box.metadata.type === 'text'
                      ? ' Text'
                      : ''}</text
                  >
                  <foreignObject
                    x="6"
                    y="28"
                    width={box.width - 12}
                    height={box.height - 28 - 6}
                    font-size="30"
                    fill="currentColor"
                    >{box.metadata.type === 'text'
                      ? box.metadata.text
                      : box.metadata.desc}</foreignObject
                  >
                </svg>
              </g>
            {/each}
            {#if !readonly}
              {#if groupBounds}
                <rect
                  x={groupBounds.x}
                  y={groupBounds.y}
                  width={groupBounds.width}
                  height={groupBounds.height}
                  fill="none"
                  stroke="currentColor"
                  stroke-dasharray="4 3"
                  vector-effect="non-scaling-stroke"
                  pointer-events="none"
                />
                {#each handles as [handle, x, y] (handle)}
                  <rect
                    x={groupBounds.x + groupBounds.width * x - width * 0.004}
                    y={groupBounds.y + groupBounds.height * y - width * 0.004}
                    width={width * 0.008}
                    height={width * 0.008}
                    fill="var(--bs-body-bg)"
                    stroke="currentColor"
                    vector-effect="non-scaling-stroke"
                    style:cursor={`${handle}-resize`}
                    data-group-handle={handle}
                    onpointerdown={(event) => down(event, selection[0], handle)}
                    role="presentation"
                  />
                {/each}
              {:else}
                {#each selection as index (index)}
                  {@const box = boxes[index]}
                  {#each handles as [handle, x, y] (handle)}
                    <rect
                      x={box.x + box.width * x - width * 0.004}
                      y={box.y + box.height * y - width * 0.004}
                      width={width * 0.008}
                      height={width * 0.008}
                      fill="var(--bs-body-bg)"
                      stroke="currentColor"
                      vector-effect="non-scaling-stroke"
                      style:cursor={`${handle}-resize`}
                      data-box-handle={`${index}-${handle}`}
                      onpointerdown={(e) => down(e, index, handle)}
                      role="presentation"
                    />
                  {/each}
                {/each}
              {/if}
            {/if}
            {#if marquee}
              <rect
                class="bbox-marquee"
                x={marquee.x}
                y={marquee.y}
                width={marquee.width}
                height={marquee.height}
                fill="var(--bs-primary)"
                fill-opacity=".12"
                stroke="var(--bs-primary)"
                stroke-dasharray="4 3"
                vector-effect="non-scaling-stroke"
                pointer-events="none"
              />
            {/if}
          </svg>
        </div>
        <BoundingBoxList
          {boxes}
          {selection}
          {readonly}
          onselect={selectFromList}
          onreorder={reorder}
          onadd={addBox}
          onkeyboard={keyboard}
        >
          <BoundingBoxGeometry
            {boxes}
            {selection}
            {readonly}
            {width}
            {height}
            oncommit={editGeometry}
          />
        </BoundingBoxList>
      </div>
      {#if active}
        <div
          class="bbox-details gap-1"
          onfocusout={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) finishEdit();
          }}
        >
          <BoundingBoxTextEditor
            bind:this={description}
            label={$t('bbox.description')}
            documentKey={selection[0]}
            {readonly}
            bind:value={() => active.metadata.desc, (desc) => editMetadata({ desc })}
            onblur={finishEdit}
          />
          <div class="bbox-plain-text">
            <label
              class="bbox-plain-text-header d-block border rounded-top border-bottom-0 bg-light p-1"
              for={`${uid}-text`}>{$t('bbox.text')}</label
            >
            <textarea
              id={`${uid}-text`}
              class="bbox-textarea form-control rounded-top-0"
              rows="4"
              aria-label={$t('bbox.text')}
              {readonly}
              value={active.metadata.text}
              oninput={(event) => editMetadata({ text: event.currentTarget.value })}
              onblur={finishEdit}></textarea>
          </div>
          <div class="d-flex gap-1 align-items-center flex-wrap">
            {#each active.metadata.palette as color, index (index)}
              <div class="d-flex align-items-center">
                <input
                  type="color"
                  class="form-control form-control-color"
                  aria-label={`${$t('bbox.color')} ${index + 1}`}
                  value={color}
                  disabled={readonly}
                  oninput={(e) => {
                    const palette = [...active.metadata.palette];
                    palette[index] = e.currentTarget.value;
                    editMetadata({ palette });
                  }}
                  onchange={finishEdit}
                />
                <button
                  type="button"
                  class="btn btn-sm"
                  aria-label={`${$t('bbox.remove_color')} ${index + 1}`}
                  title={$t('bbox.remove_color')}
                  disabled={readonly}
                  onclick={() => {
                    finishEdit();
                    editMetadata({
                      palette: active.metadata.palette.filter((_, i) => i !== index),
                    });
                    finishEdit();
                  }}><X size={12} /></button
                >
              </div>
            {/each}
            <button
              type="button"
              class="btn btn-sm"
              title={$t('bbox.add_color')}
              aria-label={$t('bbox.add_color')}
              disabled={readonly || active.metadata.palette.length >= 5}
              onclick={() => {
                finishEdit();
                editMetadata({ palette: [...active.metadata.palette, '#444444'] });
                finishEdit();
              }}><Plus size={16} /></button
            >
          </div>
        </div>
      {/if}
    {:else}
      <div
        class="bbox-json"
        onfocusin={() => {
          jsonEditing = true;
        }}
        onfocusout={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            jsonEditing = false;
            finishEdit();
          }
        }}
      >
        <JsonEditor
          bind:value={jsonText}
          {readonly}
          ariaLabel={$t('bbox.json')}
          oninput={editJson}
          onblur={() => finishEdit()}
        />
        {#if jsonError}<div class="small text-danger px-2 py-1" role="status">{jsonError}</div>{/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .bounding-boxes-widget {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch !important;
    flex-shrink: 0;
  }
  .bbox-toolbar,
  .bbox-details {
    flex-shrink: 0;
  }
  .bbox-opacity {
    width: 132px;
    flex-shrink: 0;
  }
  .bbox-tool-group {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  .bbox-tool-group + .bbox-tool-group {
    border-left: 1px solid var(--bs-border-color);
    padding-left: 0.5rem;
    margin-left: 0.25rem;
  }
  .bbox-opacity input {
    min-width: 0;
  }
  .bbox-opacity output {
    min-width: 4ch;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .bbox-plain-text {
    min-width: 0;
    flex-shrink: 0;
  }
  .bbox-plain-text-header {
    margin: 0;
  }
  .bbox-textarea {
    min-height: 96px;
  }
  :global([data-bs-theme='dark']) .bbox-plain-text-header {
    background-color: var(--bs-tertiary-bg) !important;
  }
  .bbox-tab-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .bbox-json {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    flex: 1 1 0;
    overflow: hidden;
  }
  .fit-node .bbox-tab-panel,
  .fill-json .bbox-tab-panel {
    flex: 1 1 0;
  }
  .json-view .bbox-tab-panel {
    overflow: hidden;
  }
  .json-view:not(.fit-node):not(.fill-json) .bbox-tab-panel {
    aspect-ratio: var(--bbox-aspect);
  }
  :global([data-bs-theme='dark']) .bbox-toolbar {
    background-color: var(--bs-tertiary-bg) !important;
  }
  .bbox-viewport {
    width: 100%;
    min-height: 0;
    overflow: hidden;
  }
  .bbox-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(88px, 27%, 200px);
    gap: 0.25rem;
    min-width: 0;
    min-height: 0;
  }
  .bbox-viewport > svg {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    user-select: none;
  }
  .bbox-number {
    font-family: var(--bs-font-monospace);
  }
  .bbox-details {
    display: flex;
    flex-direction: column;
    padding: 0.25rem;
  }
  .fit-node,
  .fill-json {
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
  }
  .fit-node .bbox-workspace {
    flex: 1 1 0;
  }
  .fit-node .bbox-viewport {
    aspect-ratio: auto !important;
  }
  .fit-node .bbox-details {
    flex: 0 1 auto;
    max-height: 65%;
    min-height: 0;
    overflow: auto;
  }
  .form-control-color {
    width: 2rem;
    height: 1.75rem;
    padding: 0.125rem;
  }
</style>
