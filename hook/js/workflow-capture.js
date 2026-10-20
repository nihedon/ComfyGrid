// Copy the rendered graph synchronously so a tab change cannot replace the image.
export function captureGraph(app) {
  const graph = app.rootGraph ?? app.graph;
  const canvas = app.canvas;
  const source = canvas?.canvas;
  if (!graph || canvas?.graph !== graph || !source?.width || !source.height)
    return null;

  const image = source.ownerDocument.createElement("canvas");
  image.width = 480;
  image.height = 320;
  const context = image.getContext("2d");
  if (!context) return null;

  const ds = canvas.ds;
  const scale = ds?.scale;
  const offset = ds ? [...ds.offset] : null;
  try {
    const items = [...(graph.nodes ?? []), ...(graph.groups ?? [])];
    let x = Infinity;
    let y = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const item of items) {
      const rect = item.boundingRect;
      if (!rect || rect.length < 4 || ![...rect].every(Number.isFinite))
        continue;
      x = Math.min(x, rect[0]);
      y = Math.min(y, rect[1]);
      right = Math.max(right, rect[0] + rect[2]);
      bottom = Math.max(bottom, rect[1] + rect[3]);
    }
    if (Number.isFinite(x) && ds?.fitToBounds) {
      ds.fitToBounds([x, y, right - x, bottom - y], { zoom: 0.95 });
    }
    canvas.draw(true, true);
    // Letterbox instead of stretching a wide or tall graph.
    const ratio = Math.min(
      image.width / source.width,
      image.height / source.height,
    );
    const width = source.width * ratio;
    const height = source.height * ratio;
    context.drawImage(
      source,
      (image.width - width) / 2,
      (image.height - height) / 2,
      width,
      height,
    );
    return image.toDataURL("image/webp", 0.9);
  } finally {
    if (ds && offset) {
      ds.scale = scale;
      ds.offset[0] = offset[0];
      ds.offset[1] = offset[1];
      canvas.draw(true, true);
    }
  }
}
