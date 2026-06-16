import type { GroupByKey } from '@/components/widgets/comfyui/registry/extension-loader';

export type ManifestMatchCondition = {
    node_comfy_class?: string;
    node_constructor_name?: string;
    widget_class_name?: string;
    widget_name?: string;
    widget_type?: string;
};

type ManifestWidgetDef = {
    match: ManifestMatchCondition | ManifestMatchCondition[];
    custom_element: string;
    group_by?: GroupByKey | null;
};

type ManifestIgnoreCondition = {
    comfy_class?: string;
    constructor_name?: string;
};

export type ExtensionManifestJson = {
    name: string;
    assets: {
        scripts?: string[];
        styles?: string[];
    };
    widgets: ManifestWidgetDef[];
    ignore?: ManifestIgnoreCondition[];
};
