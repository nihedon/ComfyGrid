import type { ComfyApp, ComfyCanvas, ComfyGraph } from '@/types/comfy-model';

export class ComfyUiCanvas {
    static getGraphBounds(graph: ComfyGraph): [number, number, number, number] {
        if (!graph) {
            return [0, 0, 0, 0];
        }
        const allItems = [...(graph.nodes ?? []), ...(graph.groups ?? [])];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let hasValidItem = false;
        for (const item of allItems) {
            const rect = item.boundingRect;
            if (!rect || rect.length < 4) continue;
            const [x, y, w, h] = rect;
            if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(w) || Number.isNaN(h)) continue;
            hasValidItem = true;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        }
        if (!hasValidItem) {
            return [0, 0, 0, 0];
        }
        return [minX, minY, maxX - minX, maxY - minY];
    }

    static handleGraphDataLoaded(app: ComfyApp, func: () => void) {
        const orgLoadGraphData = app.loadGraphData;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        app.loadGraphData = async function (...args: any[]) {
            try {
                return await orgLoadGraphData.apply(this, args);
            } finally {
                app.loadGraphData = orgLoadGraphData;
                func();
            }
        };
    }

    static async fitGraphToCanvas(canvas: ComfyCanvas) {
        canvas.animateToBounds(this.getGraphBounds(canvas.graph), {
            duration: 0.01,
            zoom: 0.95,
            easing: 'linear',
        });

        // waiting for loading images on nodes
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // reanimate to fit all nodes
        canvas.animateToBounds(this.getGraphBounds(canvas.graph), {
            duration: 0.01,
            zoom: 0.95,
            easing: 'linear',
        });
    }

    static async captureGraphCanvas(canvas: ComfyCanvas, options?: { width?: number; height?: number; quality?: number }) {
        const { width = 480, height = 320, quality = 0.9 } = options || {};

        canvas.draw(true, true);
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                const canvasElement = canvas.canvas;
                if (!canvasElement) {
                    resolve(null);
                    return;
                }

                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = width;
                thumbCanvas.height = height;
                const ctx = thumbCanvas.getContext('2d');
                if (!ctx) {
                    resolve(null);
                    return;
                }

                ctx.drawImage(canvasElement, 0, 0, canvasElement.width, canvasElement.height, 0, 0, width, height);
                const dataUrl = thumbCanvas.toDataURL('image/webp', quality);
                resolve(dataUrl);
            });
        });
    }
}
