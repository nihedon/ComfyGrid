<script lang="ts">
  import { flushSync, untrack } from 'svelte';
  import {
    BrushCleaning,
    Eraser,
    Maximize,
    Redo,
    RotateCw,
    Save,
    Undo,
    ZoomIn,
    ZoomOut,
  } from '@lucide/svelte';
  import { get } from 'svelte/store';
  import { comfyGridApiClient } from '@/api/api-client';
  import { t } from '@/i18n/i18n';
  import { toastState } from '@/states/toast-state.svelte';
  import logger from '@/utils/logger';

  let {
    src = $bindable(),
    alt = '',
    class: className = '',
    style: style = '',
    maxWidth = 800,
    maxHeight = 600,
    onMaskExport: handleMaskExport = () => {},
    saving = false,
  }: {
    src: string;
    alt?: string;
    class?: string;
    style?: string;
    maxWidth?: number;
    maxHeight?: number;
    onMaskExport?: (maskDataUrl: string, imageDataUrl: string) => void;
    saving?: boolean;
  } = $props();

  let containerEl = $state<HTMLDivElement>();
  let canvasEl = $state<HTMLCanvasElement>();
  let imgEl = $state<HTMLImageElement>();

  let isDrawing = $state(false);
  let brushSize = $state(40);
  type PaintSnapshot = { mask: ImageData; imageSrc: string; width: number; height: number };
  let history = $state<PaintSnapshot[]>([]);
  let historyIndex = $state(-1);
  const MAX_HISTORY_ENTRIES = 50;
  const MAX_HISTORY_BYTES = 64 * 1024 * 1024;
  let isEraser = $state(false);

  let canvasWidth = $state(0);
  let canvasHeight = $state(0);

  // Actual image dimensions (not scaled for display)
  let originalWidth = $state(0);
  let originalHeight = $state(0);

  // Zoom and pan state
  let scale = $state(1);
  let offsetX = $state(0);
  let offsetY = $state(0);
  let isPanning = $state(false);
  let panStartX = $state(0);
  let panStartY = $state(0);
  let spacePressed = $state(false);

  let baseImageSrc = $state('');
  let initialMaskSrc = $state('');

  let loading = $state(false);
  let imageLoading = $state(false);
  let maskLoading = $state(false);
  let loadFailed = $state(false);
  const displayScale = $derived(
    Math.min(1, maxWidth / (canvasWidth || 1), maxHeight / (canvasHeight || 1)),
  );
  const editingDisabled = $derived(
    saving ||
      loading ||
      imageLoading ||
      maskLoading ||
      loadFailed ||
      !originalWidth ||
      !originalHeight,
  );
  let preparedImageSrc = '';
  let pendingMaskImage: HTMLImageElement | null = null;

  function cancelMaskLoad() {
    if (!pendingMaskImage) return;
    pendingMaskImage.onload = null;
    pendingMaskImage.onerror = null;
    pendingMaskImage.src = '';
    pendingMaskImage = null;
  }

  function resetPaintData() {
    cancelMaskLoad();
    history = [];
    historyIndex = -1;
    baseImageSrc = '';
    initialMaskSrc = '';
    preparedImageSrc = '';
    imageLoading = false;
    maskLoading = false;
    loadFailed = false;
    loading = false;
    isDrawing = false;
    isPanning = false;
    spacePressed = false;
    canvasWidth = canvasHeight = originalWidth = originalHeight = 0;
    showResizeModal = false;
  }

  $effect(() => {
    const imageUrl = src;
    const controller = new AbortController();
    untrack(resetPaintData);
    if (imageUrl) {
      void loadPaintData(imageUrl, controller.signal);
    }
    return () => {
      controller.abort();
      untrack(resetPaintData);
    };
  });

  function reportError(
    key: 'toast.paint_load_failed' | 'toast.paint_save_failed' | 'toast.paint_edit_failed',
    error: unknown,
  ) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(reason, error);
    toastState.addToast({ type: 'error', message: get(t)(key, { reason }) });
  }

  function failLoad(error: unknown) {
    if (loadFailed) return;
    cancelMaskLoad();
    maskLoading = imageLoading = false;
    loadFailed = true;
    reportError('toast.paint_load_failed', error);
  }

  function isEditable() {
    return (
      !saving &&
      !loading &&
      !imageLoading &&
      !maskLoading &&
      !loadFailed &&
      originalWidth > 0 &&
      originalHeight > 0
    );
  }

  async function loadPaintData(imageUrl: string, signal: AbortSignal) {
    loading = true;
    try {
      const response = await fetch(imageUrl, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
      let data: { image: string; mask?: string };
      if (contentType?.startsWith('image/') || contentType === 'application/octet-stream') {
        const image = await response.blob();
        if (signal.aborted) return;
        const prepared = await comfyGridApiClient.postPaintData(image, signal);
        if (!prepared.ok) throw new Error(prepared.json?.error || `HTTP ${prepared.status}`);
        data = prepared.json;
      } else {
        data = await response.json();
      }
      if (signal.aborted) return;
      if (
        !data ||
        typeof data.image !== 'string' ||
        !data.image ||
        (data.mask !== undefined && typeof data.mask !== 'string')
      ) {
        throw new Error('Invalid paint data');
      }

      initialMaskSrc = data.mask ?? '';
      baseImageSrc = data.image;
    } catch (e) {
      if (signal.aborted) return;
      failLoad(e);
    } finally {
      if (!signal.aborted) loading = false;
    }
  }

  function getContext(): CanvasRenderingContext2D | null {
    return canvasEl?.getContext('2d', { willReadFrequently: true }) ?? null;
  }

  function handleImageLoad() {
    if (!imgEl || !canvasEl || !baseImageSrc || loading) return;
    imageLoading = false;
    // Resize and history restoration already supplied the matching mask and dimensions.
    if (preparedImageSrc === baseImageSrc) return;

    cancelMaskLoad();

    try {
      const ctx = getContext();
      if (!ctx) throw new Error('Unable to create the paint canvas');

      const naturalWidth = imgEl.naturalWidth;
      const naturalHeight = imgEl.naturalHeight;

      // Store actual image dimensions
      originalWidth = naturalWidth;
      originalHeight = naturalHeight;

      // Store the mask at image resolution; only its CSS presentation is scaled.
      flushSync(() => {
        canvasWidth = naturalWidth;
        canvasHeight = naturalHeight;
      });
      canvasEl.width = naturalWidth;
      canvasEl.height = naturalHeight;
      ctx.clearRect(0, 0, naturalWidth, naturalHeight);

      if (initialMaskSrc) {
        const maskImg = new Image();
        maskLoading = true;
        pendingMaskImage = maskImg;
        maskImg.onload = () => {
          if (pendingMaskImage !== maskImg) return;
          pendingMaskImage = null;
          maskImg.onload = maskImg.onerror = null;
          const ctx2 = getContext();
          if (!ctx2 || !canvasEl) {
            failLoad(new Error('Unable to create the paint canvas'));
            return;
          }

          try {
            if (
              maskImg.naturalWidth !== canvasEl.width ||
              maskImg.naturalHeight !== canvasEl.height
            ) {
              throw new Error('Mask dimensions do not match the image');
            }
            // Draw mask image to temporary canvas to get ImageData
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasEl.width;
            tempCanvas.height = canvasEl.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) throw new Error('Unable to create mask canvas');

            tempCtx.drawImage(maskImg, 0, 0, canvasEl.width, canvasEl.height);
            const maskData = tempCtx.getImageData(0, 0, canvasEl.width, canvasEl.height);

            // Draw white parts of mask (transparent areas) in black
            const canvasData = ctx2.createImageData(canvasEl.width, canvasEl.height);
            for (let i = 0; i < maskData.data.length; i += 4) {
              const maskValue = maskData.data[i]; // Only check R since it's grayscale
              if (maskValue > 0) {
                // White parts of mask -> draw in black
                canvasData.data[i] = 0; // R
                canvasData.data[i + 1] = 0; // G
                canvasData.data[i + 2] = 0; // B
                canvasData.data[i + 3] = maskValue; // A (based on mask intensity)
              }
            }
            ctx2.putImageData(canvasData, 0, 0);

            history = [];
            historyIndex = -1;
            saveToHistory();
            centerCanvas();
            preparedImageSrc = baseImageSrc;
            initialMaskSrc = '';
            maskLoading = false;
          } catch (error) {
            failLoad(error);
          }
        };
        maskImg.onerror = () => {
          if (pendingMaskImage === maskImg) failLoad(new Error('Unable to decode the paint mask'));
        };
        maskImg.src = initialMaskSrc;
      } else {
        history = [];
        historyIndex = -1;
        saveToHistory();
        centerCanvas();
        preparedImageSrc = baseImageSrc;
      }
    } catch (error) {
      failLoad(error);
    }
  }

  function centerCanvas() {
    // Center the canvas/image in the container
    if (!containerEl) return;
    const containerRect = containerEl.getBoundingClientRect();
    const ratio = Math.min(1, maxWidth / (canvasWidth || 1), maxHeight / (canvasHeight || 1));
    offsetX = Math.round((containerRect.width - canvasWidth * ratio) / 2);
    offsetY = Math.round((containerRect.height - canvasHeight * ratio) / 2);
    scale = 1;
  }

  function saveToHistory() {
    const ctx = getContext();
    if (!ctx || !canvasEl) return;

    const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    const nextHistory = [
      ...history.slice(0, historyIndex + 1),
      {
        mask: imageData,
        imageSrc: baseImageSrc,
        width: originalWidth,
        height: originalHeight,
      },
    ];
    // This map only counts retained buffers during one history update.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const imageSources = new Map<string, number>();
    let historyBytes = 0;
    for (const item of nextHistory) {
      historyBytes += item.mask.data.byteLength;
      if (!imageSources.has(item.imageSrc)) historyBytes += item.imageSrc.length * 2;
      imageSources.set(item.imageSrc, (imageSources.get(item.imageSrc) ?? 0) + 1);
    }
    // Keep the current snapshot even if it alone exceeds the budget.
    while (
      nextHistory.length > 1 &&
      (nextHistory.length > MAX_HISTORY_ENTRIES || historyBytes > MAX_HISTORY_BYTES)
    ) {
      const removed = nextHistory.shift()!;
      historyBytes -= removed.mask.data.byteLength;
      const references = imageSources.get(removed.imageSrc)! - 1;
      imageSources.set(removed.imageSrc, references);
      if (!references) historyBytes -= removed.imageSrc.length * 2;
    }
    history = nextHistory;
    historyIndex = history.length - 1;
  }

  function setPreparedImage(imageSrc: string) {
    preparedImageSrc = imageSrc;
    if (baseImageSrc !== imageSrc) imageLoading = true;
    baseImageSrc = imageSrc;
  }

  function restoreSnapshot(snapshot: PaintSnapshot) {
    const ctx = getContext();
    if (!canvasEl || !ctx) return;
    const resized = originalWidth !== snapshot.width || originalHeight !== snapshot.height;
    originalWidth = snapshot.width;
    originalHeight = snapshot.height;
    flushSync(() => {
      canvasWidth = snapshot.mask.width;
      canvasHeight = snapshot.mask.height;
    });
    canvasEl.width = snapshot.mask.width;
    canvasEl.height = snapshot.mask.height;
    ctx.putImageData(snapshot.mask, 0, 0);
    setPreparedImage(snapshot.imageSrc);
    if (resized) centerCanvas();
  }

  function undo() {
    if (isEditable() && historyIndex > 0 && canvasEl) {
      historyIndex--;
      restoreSnapshot(history[historyIndex]);
    }
  }

  function redo() {
    if (isEditable() && historyIndex < history.length - 1 && canvasEl) {
      historyIndex++;
      restoreSnapshot(history[historyIndex]);
    }
  }

  function clearCanvas() {
    if (!isEditable()) return;
    const ctx = getContext();
    if (!ctx || !canvasEl) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    saveToHistory();
  }

  function toggleEraser() {
    isEraser = !isEraser;
  }

  function getPointerPos(e: PointerEvent): { x: number; y: number } | null {
    if (!containerEl) return null;

    // Use container rect instead of canvas rect since canvas has transform applied
    const rect = containerEl.getBoundingClientRect();
    // Get coordinates relative to container
    const containerX = e.clientX - rect.left;
    const containerY = e.clientY - rect.top;

    // Convert to canvas coordinates by reversing the transform
    const ratio = Math.min(1, maxWidth / (canvasWidth || 1), maxHeight / (canvasHeight || 1));
    const x = (containerX - offsetX) / (scale * ratio);
    const y = (containerY - offsetY) / (scale * ratio);

    return { x, y };
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (!containerEl) return;

    const rect = containerEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate zoom
    const delta = -e.deltaY;
    const zoomIntensity = 0.1;
    const zoom = Math.exp(delta * zoomIntensity * 0.01);
    const newScale = Math.min(Math.max(0.1, scale * zoom), 10);

    // Adjust offset to zoom towards mouse position
    offsetX = mouseX - (mouseX - offsetX) * (newScale / scale);
    offsetY = mouseY - (mouseY - offsetY) * (newScale / scale);
    scale = newScale;
  }

  function startPan(e: MouseEvent) {
    if (spacePressed || e.button === 1) {
      // Space key or middle mouse button
      e.preventDefault();
      isPanning = true;
      panStartX = e.clientX - offsetX;
      panStartY = e.clientY - offsetY;
    }
  }

  function handlePan(e: MouseEvent) {
    if (isPanning) {
      e.preventDefault();
      offsetX = e.clientX - panStartX;
      offsetY = e.clientY - panStartY;
    }
  }

  function stopPan() {
    isPanning = false;
  }

  function resetView() {
    centerCanvas();
  }

  function zoomIn() {
    scale = Math.min(scale * 1.2, 10);
  }

  function zoomOut() {
    scale = Math.max(scale / 1.2, 0.1);
  }

  // Keyboard event handlers
  function handleKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space') {
      e.preventDefault();
      spacePressed = true;
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') {
      spacePressed = false;
      stopPan();
    }
  }

  function startDrawing(e: PointerEvent) {
    if (!isEditable()) return;
    if (!e.isPrimary) {
      stopDrawing();
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    if (e.isTrusted) canvasEl?.setPointerCapture(e.pointerId);
    // Check if we should pan instead of draw
    if (spacePressed || e.button === 1) {
      startPan(e);
      return;
    }

    const ctx = getContext();
    const pos = getPointerPos(e);
    if (!pos || !ctx) return;

    isDrawing = true;
    containerEl?.focus({ preventScroll: true });
    const ratio = Math.min(1, maxWidth / (canvasWidth || 1), maxHeight / (canvasHeight || 1));
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, getBrushSize() / ratio / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: PointerEvent) {
    if (!e.isPrimary) {
      stopDrawing();
      return;
    }
    const ctx = getContext();
    if (!isEditable() || !isDrawing || !ctx) return;

    const pos = getPointerPos(e);
    if (!pos) return;

    const ratio = Math.min(1, maxWidth / (canvasWidth || 1), maxHeight / (canvasHeight || 1));
    ctx.lineWidth = getBrushSize() / ratio;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isEraser) {
      // Eraser mode: use destination-out to erase
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      // Draw mode: normal drawing
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'black';
    }

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function stopDrawing() {
    const ctx = getContext();
    if (isDrawing) {
      isDrawing = false;
      // Reset composite operation
      if (ctx) {
        ctx.globalCompositeOperation = 'source-over';
      }
      saveToHistory();
    }
  }

  function exportMask() {
    if (!isEditable()) return;
    stopDrawing();
    try {
      const ctx = getContext();
      if (!canvasEl || !ctx || !imgEl) return;

      // Export alpha as grayscale without thresholding or resampling.
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = originalWidth;
      maskCanvas.height = originalHeight;
      const maskCtx = maskCanvas.getContext('2d');

      if (!maskCtx) throw new Error('Unable to create the export canvas');
      const displayImageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const displayMaskImageData = maskCtx.createImageData(canvasEl.width, canvasEl.height);

      for (let i = 0; i < displayImageData.data.length; i += 4) {
        const alpha = displayImageData.data[i + 3];
        displayMaskImageData.data[i] = alpha; // R
        displayMaskImageData.data[i + 1] = alpha; // G
        displayMaskImageData.data[i + 2] = alpha; // B
        displayMaskImageData.data[i + 3] = 255; // A
      }
      maskCtx.putImageData(displayMaskImageData, 0, 0);

      const maskDataUrl = maskCanvas.toDataURL('image/png');

      // Export the current background image at actual size
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = originalWidth;
      imageCanvas.height = originalHeight;
      const imageCtx = imageCanvas.getContext('2d');
      if (!imageCtx) throw new Error('Unable to create the export canvas');
      imageCtx.drawImage(imgEl, 0, 0, originalWidth, originalHeight);
      const imageDataUrl = imageCanvas.toDataURL('image/png');

      handleMaskExport(maskDataUrl, imageDataUrl);
    } catch (error) {
      reportError('toast.paint_save_failed', error);
    }
  }

  let brushCursorEl = $state<HTMLDivElement>();

  function updateBrushCursorPosition(e: MouseEvent) {
    if (!brushCursorEl || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const displayBrushSize = getBrushSize() * scale;
    brushCursorEl.style.width = `${displayBrushSize}px`;
    brushCursorEl.style.height = `${displayBrushSize}px`;
    brushCursorEl.style.transform = `translate(${x - displayBrushSize / 2}px, ${y - displayBrushSize / 2}px)`;
  }

  function handleMouseMove(e: PointerEvent) {
    updateBrushCursorPosition(e);
    if (isPanning) {
      handlePan(e);
    } else {
      draw(e);
    }
  }

  function handleMouseEnter() {
    if (brushCursorEl) brushCursorEl.style.display = '';
  }

  function handleMouseLeave(e: PointerEvent) {
    if (brushCursorEl) brushCursorEl.style.display = 'none';
    if (!canvasEl?.hasPointerCapture(e.pointerId)) {
      stopDrawing();
      stopPan();
    }
  }

  const canUndo = $derived(historyIndex > 0);
  const canRedo = $derived(historyIndex < history.length - 1);

  // Canvas resize state
  let showResizeModal = $state(false);
  let newWidth = $state(0);
  let newHeight = $state(0);
  let fillColor = $state('#ffffff');
  let anchorPoint = $state<
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'middle-left'
    | 'middle-center'
    | 'middle-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'
  >('middle-center');

  function openResizeModal() {
    if (!isEditable()) return;
    newWidth = originalWidth;
    newHeight = originalHeight;
    anchorPoint = 'middle-center';
    showResizeModal = true;
  }

  function closeResizeModal() {
    showResizeModal = false;
  }

  function applyResize() {
    if (
      !isEditable() ||
      !canvasEl ||
      !imgEl ||
      !validDimension(newWidth) ||
      !validDimension(newHeight)
    )
      return;

    try {
      const ctx = getContext();
      if (!ctx) throw new Error('Unable to create the paint canvas');

      // Calculate offset based on anchor point (in actual image coordinates)
      let offsetXPos = 0;
      let offsetYPos = 0;

      switch (anchorPoint) {
        case 'top-left':
          offsetXPos = 0;
          offsetYPos = 0;
          break;
        case 'top-center':
          offsetXPos = Math.floor((newWidth - originalWidth) / 2);
          offsetYPos = 0;
          break;
        case 'top-right':
          offsetXPos = newWidth - originalWidth;
          offsetYPos = 0;
          break;
        case 'middle-left':
          offsetXPos = 0;
          offsetYPos = Math.floor((newHeight - originalHeight) / 2);
          break;
        case 'middle-center':
          offsetXPos = Math.floor((newWidth - originalWidth) / 2);
          offsetYPos = Math.floor((newHeight - originalHeight) / 2);
          break;
        case 'middle-right':
          offsetXPos = newWidth - originalWidth;
          offsetYPos = Math.floor((newHeight - originalHeight) / 2);
          break;
        case 'bottom-left':
          offsetXPos = 0;
          offsetYPos = newHeight - originalHeight;
          break;
        case 'bottom-center':
          offsetXPos = Math.floor((newWidth - originalWidth) / 2);
          offsetYPos = newHeight - originalHeight;
          break;
        case 'bottom-right':
          offsetXPos = newWidth - originalWidth;
          offsetYPos = newHeight - originalHeight;
          break;
      }

      // Create a new image with white background and the original image placed (at actual size)
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = newWidth;
      tempCanvas.height = newHeight;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) throw new Error('Unable to create the resized image');

      // Fill with selected background color
      tempCtx.fillStyle = fillColor;
      tempCtx.fillRect(0, 0, newWidth, newHeight);

      // Draw the original image at the offset position (at its current actual size)
      tempCtx.drawImage(imgEl, offsetXPos, offsetYPos, originalWidth, originalHeight);
      const resizedImageSrc = tempCanvas.toDataURL('image/png');

      // Move/crop the full-resolution mask using the same offset as the image.
      const maskTempCanvas = document.createElement('canvas');
      maskTempCanvas.width = newWidth;
      maskTempCanvas.height = newHeight;
      const maskTempCtx = maskTempCanvas.getContext('2d');
      if (!maskTempCtx) throw new Error('Unable to create the resized mask');

      maskTempCtx.drawImage(canvasEl, offsetXPos, offsetYPos);
      const resizedMask = maskTempCtx.getImageData(0, 0, newWidth, newHeight);

      // Update canvas dimensions
      flushSync(() => {
        canvasWidth = newWidth;
        canvasHeight = newHeight;
      });
      canvasEl.width = newWidth;
      canvasEl.height = newHeight;

      ctx.putImageData(resizedMask, 0, 0);

      originalWidth = newWidth;
      originalHeight = newHeight;
      cancelMaskLoad();
      setPreparedImage(resizedImageSrc);
      centerCanvas();
      saveToHistory();
      closeResizeModal();
    } catch (error) {
      reportError('toast.paint_edit_failed', error);
    }
  }

  function validDimension(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4096;
  }

  function getBrushSize() {
    return typeof brushSize === 'number' && Number.isFinite(brushSize)
      ? Math.round(Math.min(150, Math.max(1, brushSize)))
      : 40;
  }

  function handleBlur() {
    spacePressed = false;
    stopDrawing();
    stopPan();
  }

  const anchorPoints = [
    ['top-left', 'top-center', 'top-right'],
    ['middle-left', 'middle-center', 'middle-right'],
    ['bottom-left', 'bottom-center', 'bottom-right'],
  ] as const;
</script>

<svelte:window onblur={handleBlur} />

<div class={className}>
  <ul class="navbar-nav d-flex flex-row p-2 align-items-center gap-2">
    <li class="nav-item d-flex align-items-center gap-2 flex-grow-1">
      <div class="btn-group">
        <button
          class="btn btn-secondary btn-sm d-flex align-items-center gap-1"
          onclick={undo}
          disabled={editingDisabled || !canUndo}
          title="Undo"
        >
          <Undo size={16} />
          Undo
        </button>
        <button
          class="btn btn-secondary btn-sm d-flex align-items-center gap-1"
          onclick={redo}
          disabled={editingDisabled || !canRedo}
          title="Redo"
        >
          <Redo size={16} />
          Redo
        </button>
      </div>
      <button
        class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
        onclick={clearCanvas}
        disabled={editingDisabled}
        title="Clear"
      >
        <BrushCleaning size={16} />
        Clear
      </button>
      <div class="btn-group">
        <button
          class="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center"
          onclick={zoomOut}
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          onclick={resetView}
          title="Reset View (100%)"
        >
          <RotateCw size={16} />
          {Math.round(scale * 100)}%
        </button>
        <button
          class="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center"
          onclick={zoomIn}
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
      </div>
      <div class="d-flex flex-row align-items-center gap-2">
        <input
          class="form-range"
          type="range"
          disabled={editingDisabled}
          bind:value={brushSize}
          min="1"
          max="150"
          step="1"
        />
        <input
          class="form-control"
          type="number"
          name="brush-size"
          style="padding: 2px 6px; width: 54px;"
          min="1"
          max="150"
          step="1"
          bind:value={brushSize}
          disabled={editingDisabled}
          onchange={() => (brushSize = getBrushSize())}
        />
      </div>
      <button
        class="btn btn-sm d-flex align-items-center justify-content-center"
        class:btn-secondary={isEraser}
        class:btn-outline-secondary={!isEraser}
        onclick={toggleEraser}
        disabled={editingDisabled}
        title="Eraser"
      >
        <Eraser size={16} />
      </button>
      <button
        class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
        onclick={openResizeModal}
        disabled={editingDisabled}
        title="Resize Canvas"
      >
        <Maximize size={16} />
        {originalWidth} x {originalHeight}
      </button>
    </li>
    <li class="nav-item">
      <button
        class="btn btn-primary btn-sm d-flex align-items-center gap-1"
        onclick={exportMask}
        disabled={editingDisabled}
        title="Export"
      >
        <Save size={16} />
        Export
      </button>
    </li>
  </ul>

  <div class="d-flex justify-content-center checkerboard flex-grow-1">
    {#if loading}
      <div class="d-flex align-items-center justify-content-center p-5">
        <div class="spinner-border text-light" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="canvas-container"
        bind:this={containerEl}
        tabindex="0"
        onkeydown={handleKeyDown}
        onkeyup={handleKeyUp}
        onblur={handleBlur}
        onwheel={handleWheel}
      >
        <img
          bind:this={imgEl}
          src={baseImageSrc || undefined}
          {alt}
          draggable="false"
          onload={handleImageLoad}
          onerror={() => failLoad(new Error('Unable to decode the paint image'))}
          {style}
          style:max-width="{maxWidth}px"
          style:max-height="{maxHeight}px"
          style:transform="translate({offsetX}px, {offsetY}px) scale({scale})"
          style:transform-origin="0 0"
        />

        <canvas
          bind:this={canvasEl}
          class="drawing-canvas"
          class:eraser-cursor={isEraser}
          class:pan-cursor={spacePressed || isPanning}
          width={canvasWidth}
          height={canvasHeight}
          style:width="{canvasWidth * displayScale}px"
          style:height="{canvasHeight * displayScale}px"
          onpointerdown={startDrawing}
          onpointermove={handleMouseMove}
          onpointerup={() => {
            stopDrawing();
            stopPan();
          }}
          onpointerenter={handleMouseEnter}
          onpointerleave={handleMouseLeave}
          onpointercancel={handleBlur}
          onlostpointercapture={handleBlur}
          style:transform="translate({offsetX}px, {offsetY}px) scale({scale})"
          style:transform-origin="0 0"
        ></canvas>
        <div
          bind:this={brushCursorEl}
          class="brush-cursor"
          class:eraser-mode={isEraser}
          style:width="{getBrushSize() * scale}px"
          style:height="{getBrushSize() * scale}px"
          style:display="none"
        ></div>
      </div>
    {/if}
  </div>
</div>

<!-- Resize Modal -->
{#if showResizeModal}
  <div class="resize-modal-overlay">
    <div class="resize-modal">
      <div class="resize-modal-header">
        <h5>Resize Canvas</h5>
        <button class="btn-close" onclick={closeResizeModal} aria-label="Close"></button>
      </div>
      <div class="resize-modal-body">
        <div class="size-inputs">
          <div class="size-group">
            <span class="size-label">Current Size</span>
            <div class="size-display">{originalWidth} x {originalHeight}</div>
          </div>
          <div class="size-group">
            <label for="new-width">New Width</label>
            <input
              id="new-width"
              type="number"
              class="form-control"
              bind:value={newWidth}
              min="1"
              max="4096"
            />
          </div>
          <div class="size-group">
            <label for="new-height">New Height</label>
            <input
              id="new-height"
              type="number"
              class="form-control"
              bind:value={newHeight}
              min="1"
              max="4096"
            />
          </div>
        </div>

        <div class="anchor-section">
          <span class="anchor-label">Anchor Point</span>
          <div class="anchor-grid">
            {#each anchorPoints as row, rowIndex (rowIndex)}
              <div class="anchor-row">
                {#each row as point (point)}
                  <button
                    class="anchor-point"
                    class:selected={anchorPoint === point}
                    onclick={() => (anchorPoint = point)}
                    title={point}
                  >
                    <span class="anchor-dot"></span>
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        </div>

        <div class="color-section">
          <label for="fill-color" class="color-label">Fill Color</label>
          <input
            id="fill-color"
            type="color"
            class="form-control form-control-color"
            bind:value={fillColor}
            title="Choose fill color"
          />
        </div>
      </div>
      <div class="resize-modal-footer">
        <button class="btn btn-secondary" onclick={closeResizeModal}>Cancel</button>
        <button
          class="btn btn-primary"
          disabled={editingDisabled || !validDimension(newWidth) || !validDimension(newHeight)}
          onclick={applyResize}>Apply</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .canvas-container:focus {
    outline: none;
  }

  .drawing-canvas {
    position: absolute;
    top: 0;
    left: 0;
    cursor: none; /* Hide default cursor */
    touch-action: none;
  }

  .drawing-canvas.pan-cursor {
    cursor: grab !important;
  }

  .drawing-canvas.pan-cursor:active {
    cursor: grabbing !important;
  }

  .brush-cursor {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
    will-change: transform;
    z-index: 1000;
  }

  .brush-cursor.eraser-mode {
    border-color: rgba(255, 100, 100, 0.8);
  }

  .checkerboard {
    background-image:
      linear-gradient(45deg, #ccc 25%, transparent 25%),
      linear-gradient(-45deg, #ccc 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #ccc 75%),
      linear-gradient(-45deg, transparent 75%, #ccc 75%);
    background-size: 16px 16px;
    background-position:
      0 0,
      0 8px,
      8px -8px,
      -8px 0px;
    background-color: #fff;
  }

  /* Resize Modal Styles */
  .resize-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .resize-modal {
    background: var(--bs-body-bg, #fff);
    border-radius: 8px;
    min-width: 320px;
    max-width: 400px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .resize-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--bs-border-color, #dee2e6);
  }

  .resize-modal-header h5 {
    margin: 0;
    font-size: 1.1rem;
  }

  .resize-modal-body {
    padding: 1rem;
  }

  .size-inputs {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .size-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .size-group label,
  .size-group .size-label {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .size-display {
    padding: 0.375rem 0.75rem;
    background: var(--bs-tertiary-bg, #f8f9fa);
    border-radius: 4px;
    font-family: monospace;
  }

  .anchor-section {
    margin-top: 1rem;
  }

  .anchor-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .anchor-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: fit-content;
    margin: 0 auto;
    padding: 8px;
    background: var(--bs-tertiary-bg, #f8f9fa);
    border-radius: 8px;
  }

  .anchor-row {
    display: flex;
    gap: 4px;
  }

  .anchor-point {
    width: 32px;
    height: 32px;
    border: 2px solid var(--bs-border-color, #dee2e6);
    border-radius: 4px;
    background: var(--bs-body-bg, #fff);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .anchor-point:hover {
    border-color: var(--bs-primary, #0d6efd);
  }

  .anchor-point.selected {
    border-color: var(--bs-primary, #0d6efd);
    background: var(--bs-primary, #0d6efd);
  }

  .anchor-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--bs-secondary, #6c757d);
  }

  .anchor-point.selected .anchor-dot {
    background: #fff;
  }

  .color-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .color-label {
    font-size: 0.875rem;
    font-weight: 500;
    margin: 0;
  }

  .form-control-color {
    width: 48px;
    height: 32px;
    padding: 2px;
  }

  .resize-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 1rem;
    border-top: 1px solid var(--bs-border-color, #dee2e6);
  }
</style>
