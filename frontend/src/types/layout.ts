import type { BoardId } from './board';

export type FloatingPosition = {
    x: number;
    y: number;
    w: number;
    h: number;
};

export type LayoutType = {
    graphId: string | null;
    floatingNodes: Record<string, BoardId>;
    floatingWidgets: Record<string, BoardId>;
    floatingPositions: Record<string, Record<string, FloatingPosition>>;
    promptWidgetIds: string[];
    positivePromptWidgetId: string | null;
    negativePromptWidgetId: string | null;
    noControlNodes: boolean;
    noCollapsedNodes: boolean;
    sortOrder: 'default' | 'name';
};
