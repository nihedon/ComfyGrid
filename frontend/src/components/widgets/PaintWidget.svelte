<script lang="ts">
  import logger from '@/utils/logger';

  let {
    src = $bindable(),
    alt = '',
    class: className = '',
    style: style = '',
    maxWidth = 800,
    maxHeight = 600,
    onMaskExport: handleMaskExport = () => {},
  }: {
    src: string;
    alt?: string;
    class?: string;
    style?: string;
    maxWidth?: number;
    maxHeight?: number;
    onMaskExport?: (maskDataUrl: string, imageDataUrl: string) => void;
  } = $props();

  let containerEl = $state<HTMLDivElement>();
  let canvasEl = $state<HTMLCanvasElement>();
  let imgEl = $state<HTMLImageElement>();

  let isDrawing = $state(false);
  let brushSize = $state(40);
  let history = $state<ImageData[]>([]);
  let historyIndex = $state(-1);
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

  $effect(() => {
    if (src && !src.startsWith('data:')) {
      loadPaintData(src);
    }
  });

  async function loadPaintData(imageUrl: string) {
    loading = true;
    try {
      const response = await fetch(imageUrl);
      const data = await response.json();

      initialMaskSrc = data.mask;
      baseImageSrc = data.image;
    } catch (e) {
      logger.error('Failed to load paint data:', e);
      baseImageSrc = imageUrl;
      initialMaskSrc = '';
    } finally {
      loading = false;
    }
  }

  function getContext(): CanvasRenderingContext2D | null {
    return canvasEl?.getContext('2d') ?? null;
  }

  function handleImageLoad() {
    if (!imgEl || !canvasEl) return;

    const ctx = getContext();
    if (!ctx) return;

    const naturalWidth = imgEl.naturalWidth;
    const naturalHeight = imgEl.naturalHeight;

    // Store actual image dimensions
    originalWidth = naturalWidth;
    originalHeight = naturalHeight;

    // Calculate display size (scaled to fit within maxWidth/maxHeight)
    let displayWidth = naturalWidth;
    let displayHeight = naturalHeight;

    if (displayWidth > maxWidth) {
      displayHeight = (displayHeight * maxWidth) / displayWidth;
      displayWidth = maxWidth;
    }
    if (displayHeight > maxHeight) {
      displayWidth = (displayWidth * maxHeight) / displayHeight;
      displayHeight = maxHeight;
    }

    // Ensure integer values for canvas dimensions
    displayWidth = Math.round(displayWidth);
    displayHeight = Math.round(displayHeight);

    canvasWidth = displayWidth;
    canvasHeight = displayHeight;

    canvasEl.width = displayWidth;
    canvasEl.height = displayHeight;

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    if (initialMaskSrc) {
      const maskImg = new Image();
      maskImg.onload = () => {
        const ctx2 = getContext();
        if (!ctx2 || !canvasEl) return;

        // Draw mask image to temporary canvas to get ImageData
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasEl.width;
        tempCanvas.height = canvasEl.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

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
      };
      maskImg.src = initialMaskSrc;
    } else {
      history = [];
      historyIndex = -1;
      saveToHistory();
      centerCanvas();
    }
  }

  function centerCanvas() {
    // Center the canvas/image in the container
    if (!containerEl) return;
    const containerRect = containerEl.getBoundingClientRect();
    offsetX = Math.round((containerRect.width - canvasWidth) / 2);
    offsetY = Math.round((containerRect.height - canvasHeight) / 2);
    scale = 1;
  }

  function saveToHistory() {
    const ctx = getContext();
    if (!ctx || !canvasEl) return;

    history = history.slice(0, historyIndex + 1);

    const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    history = [...history, imageData];
    historyIndex = history.length - 1;
  }

  function undo() {
    const ctx = getContext();
    if (historyIndex > 0 && ctx && canvasEl) {
      historyIndex--;
      ctx.putImageData(history[historyIndex], 0, 0);
    }
  }

  function redo() {
    const ctx = getContext();
    if (historyIndex < history.length - 1 && ctx && canvasEl) {
      historyIndex++;
      ctx.putImageData(history[historyIndex], 0, 0);
    }
  }

  function clearCanvas() {
    const ctx = getContext();
    if (!ctx || !canvasEl) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    saveToHistory();
  }

  function toggleEraser() {
    isEraser = !isEraser;
  }

  function getPointerPos(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
    if (!containerEl) return null;

    // Use container rect instead of canvas rect since canvas has transform applied
    const rect = containerEl.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Get coordinates relative to container
    const containerX = clientX - rect.left;
    const containerY = clientY - rect.top;

    // Convert to canvas coordinates by reversing the transform
    const x = (containerX - offsetX) / scale;
    const y = (containerY - offsetY) / scale;

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
    scale = 1;
    offsetX = 0;
    offsetY = 0;
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

  function startDrawing(e: MouseEvent | TouchEvent) {
    // Check if we should pan instead of draw
    if (e instanceof MouseEvent) {
      if (spacePressed || e.button === 1) {
        startPan(e);
        return;
      }
    }

    const ctx = getContext();
    const pos = getPointerPos(e);
    if (!pos || !ctx) return;

    isDrawing = true;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: MouseEvent | TouchEvent) {
    const ctx = getContext();
    if (!isDrawing || !ctx) return;

    const pos = getPointerPos(e);
    if (!pos) return;

    ctx.lineWidth = brushSize;
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
    const ctx = getContext();
    if (!canvasEl || !ctx || !imgEl) return;

    // Create mask at actual image size (not display size)
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = originalWidth;
    maskCanvas.height = originalHeight;
    const maskCtx = maskCanvas.getContext('2d');

    if (!maskCtx) return;

    // Fill background with black
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Scale up the display canvas mask to actual size
    const displayMaskCanvas = document.createElement('canvas');
    displayMaskCanvas.width = canvasEl.width;
    displayMaskCanvas.height = canvasEl.height;
    const displayMaskCtx = displayMaskCanvas.getContext('2d');
    if (!displayMaskCtx) return;

    // Get display canvas content and draw to display mask canvas
    const displayImageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    const displayMaskImageData = displayMaskCtx.createImageData(canvasEl.width, canvasEl.height);

    // Convert drawn parts to white
    for (let i = 0; i < displayImageData.data.length; i += 4) {
      const alpha = displayImageData.data[i + 3];
      if (alpha > 10) {
        displayMaskImageData.data[i] = 255; // R
        displayMaskImageData.data[i + 1] = 255; // G
        displayMaskImageData.data[i + 2] = 255; // B
        displayMaskImageData.data[i + 3] = 255; // A
      }
    }
    displayMaskCtx.putImageData(displayMaskImageData, 0, 0);

    // Scale up to actual size
    maskCtx.drawImage(displayMaskCanvas, 0, 0, originalWidth, originalHeight);

    const maskDataUrl = maskCanvas.toDataURL('image/png');

    // Export the current background image at actual size
    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = originalWidth;
    imageCanvas.height = originalHeight;
    const imageCtx = imageCanvas.getContext('2d');
    if (!imageCtx) return;
    imageCtx.drawImage(imgEl, 0, 0, originalWidth, originalHeight);
    const imageDataUrl = imageCanvas.toDataURL('image/png');

    handleMaskExport(maskDataUrl, imageDataUrl);
  }

  let brushCursorEl = $state<HTMLDivElement>();

  function updateBrushCursorPosition(e: MouseEvent) {
    if (!brushCursorEl || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    brushCursorEl.style.transform = `translate(${x - brushSize / 2}px, ${y - brushSize / 2}px)`;
  }

  function handleMouseMove(e: MouseEvent) {
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

  function handleMouseLeave() {
    if (brushCursorEl) brushCursorEl.style.display = 'none';
    stopDrawing();
    stopPan();
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
    newWidth = originalWidth;
    newHeight = originalHeight;
    anchorPoint = 'middle-center';
    showResizeModal = true;
  }

  function closeResizeModal() {
    showResizeModal = false;
  }

  function applyResize() {
    if (!canvasEl || !imgEl || newWidth <= 0 || newHeight <= 0) return;

    const ctx = getContext();
    if (!ctx) return;

    // Get current mask canvas content (in display size)
    const currentMaskData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

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
    if (!tempCtx) return;

    // Fill with selected background color
    tempCtx.fillStyle = fillColor;
    tempCtx.fillRect(0, 0, newWidth, newHeight);

    // Draw the original image at the offset position (at its current actual size)
    tempCtx.drawImage(imgEl, offsetXPos, offsetYPos, originalWidth, originalHeight);

    // Update actual dimensions
    const oldOriginalWidth = originalWidth;
    const oldOriginalHeight = originalHeight;
    originalWidth = newWidth;
    originalHeight = newHeight;

    // Calculate new display size
    let displayWidth = newWidth;
    let displayHeight = newHeight;

    if (displayWidth > maxWidth) {
      displayHeight = (displayHeight * maxWidth) / displayWidth;
      displayWidth = maxWidth;
    }
    if (displayHeight > maxHeight) {
      displayWidth = (displayWidth * maxHeight) / displayHeight;
      displayHeight = maxHeight;
    }
    displayWidth = Math.round(displayWidth);
    displayHeight = Math.round(displayHeight);

    // Update the base image source with the new resized image
    baseImageSrc = tempCanvas.toDataURL('image/png');

    // Create scaled mask for new display size
    const maskTempCanvas = document.createElement('canvas');
    maskTempCanvas.width = displayWidth;
    maskTempCanvas.height = displayHeight;
    const maskTempCtx = maskTempCanvas.getContext('2d');
    if (!maskTempCtx) return;

    // Draw current mask scaled to new display size with offset
    const scaleX = displayWidth / newWidth;
    const scaleY = displayHeight / newHeight;
    const displayOffsetX = Math.round(offsetXPos * scaleX);
    const displayOffsetY = Math.round(offsetYPos * scaleY);
    const displayOldWidth = Math.round(oldOriginalWidth * scaleX);
    const displayOldHeight = Math.round(oldOriginalHeight * scaleY);

    // Scale the old mask to new position
    const oldMaskCanvas = document.createElement('canvas');
    oldMaskCanvas.width = canvasWidth;
    oldMaskCanvas.height = canvasHeight;
    const oldMaskCtx = oldMaskCanvas.getContext('2d');
    if (oldMaskCtx) {
      oldMaskCtx.putImageData(currentMaskData, 0, 0);
      maskTempCtx.drawImage(
        oldMaskCanvas,
        displayOffsetX,
        displayOffsetY,
        displayOldWidth,
        displayOldHeight,
      );
    }

    // Update canvas dimensions
    canvasWidth = displayWidth;
    canvasHeight = displayHeight;
    canvasEl.width = displayWidth;
    canvasEl.height = displayHeight;

    // Apply scaled mask
    const scaledMaskData = maskTempCtx.getImageData(0, 0, displayWidth, displayHeight);
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.putImageData(scaledMaskData, 0, 0);

    saveToHistory();
    closeResizeModal();
  }

  const anchorPoints = [
    ['top-left', 'top-center', 'top-right'],
    ['middle-left', 'middle-center', 'middle-right'],
    ['bottom-left', 'bottom-center', 'bottom-right'],
  ] as const;
</script>

<div class={className}>
  <ul class="navbar-nav d-flex flex-row p-2 align-items-center gap-2">
    <li class="nav-item d-flex align-items-center gap-2 flex-grow-1">
      <div class="btn-group">
        <button class="btn btn-secondary btn-sm" onclick={undo} disabled={!canUndo} title="Undo">
          <i class="pi pi-arrow-circle-left"></i>
          Undo
        </button>
        <button class="btn btn-secondary btn-sm" onclick={redo} disabled={!canRedo} title="Redo">
          <i class="pi pi-arrow-circle-right"></i>
          Redo
        </button>
      </div>
      <button class="btn btn-outline-secondary btn-sm" onclick={clearCanvas} title="Clear">
        <i class="pi pi-refresh"></i>
        Clear
      </button>
      <div class="btn-group">
        <button class="btn btn-outline-secondary btn-sm" onclick={zoomOut} title="Zoom Out">
          <i class="pi pi-search-minus"></i>
        </button>
        <button
          class="btn btn-outline-secondary btn-sm"
          onclick={resetView}
          title="Reset View (100%)"
        >
          <i class="pi pi-sync"></i>
          {Math.round(scale * 100)}%
        </button>
        <button class="btn btn-outline-secondary btn-sm" onclick={zoomIn} title="Zoom In">
          <i class="pi pi-search-plus"></i>
        </button>
      </div>
      <div class="d-flex flex-row align-items-center gap-2">
        <input class="form-range" type="range" bind:value={brushSize} min="1" max="150" step="1" />
        <input
          class="form-control"
          type="number"
          name="brush-size"
          style="padding: 2px 6px; width: 54px;"
          min="1"
          max="150"
          step="1"
          bind:value={brushSize}
        />
      </div>
      <button
        class="btn btn-sm"
        class:btn-secondary={isEraser}
        class:btn-outline-secondary={!isEraser}
        onclick={toggleEraser}
        title="Eraser"
      >
        <i class="pi pi-eraser"></i>
      </button>
      <button
        class="btn btn-outline-secondary btn-sm"
        onclick={openResizeModal}
        title="Resize Canvas"
      >
        <i class="pi pi-expand"></i>
        {originalWidth} x {originalHeight}
      </button>
    </li>
    <li class="nav-item">
      <button
        class="btn btn-primary btn-sm"
        data-bs-dismiss="modal"
        onclick={exportMask}
        title="Export"
      >
        <i class="pi pi-save"></i>
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
        onwheel={handleWheel}
      >
        <img
          bind:this={imgEl}
          src={baseImageSrc}
          {alt}
          draggable="false"
          onload={handleImageLoad}
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
          onmousedown={startDrawing}
          onmousemove={handleMouseMove}
          onmouseup={() => {
            stopDrawing();
            stopPan();
          }}
          onmouseenter={handleMouseEnter}
          onmouseleave={handleMouseLeave}
          ontouchstart={startDrawing}
          ontouchmove={draw}
          ontouchend={stopDrawing}
          ontouchcancel={stopDrawing}
          style:transform="translate({offsetX}px, {offsetY}px) scale({scale})"
          style:transform-origin="0 0"
        ></canvas>
        <div
          bind:this={brushCursorEl}
          class="brush-cursor"
          class:eraser-mode={isEraser}
          style:width="{brushSize}px"
          style:height="{brushSize}px"
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
        <button class="btn btn-primary" onclick={applyResize}>Apply</button>
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
    inset: 0;
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
