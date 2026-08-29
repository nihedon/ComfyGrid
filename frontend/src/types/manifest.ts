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
};

type ManifestIgnoreCondition = {
    comfy_class?: string;
    constructor_name?: string;
};

export type ExtensionManifestJson = {
    name: string;
    frontend?: {
        scripts?: string[];
        styles?: string[];
        templates?: string[];
    };
    assets?: {
        scripts?: string[];
        styles?: string[];
    };
    widgets: ManifestWidgetDef[];
    ignore?: ManifestIgnoreCondition[];
};
