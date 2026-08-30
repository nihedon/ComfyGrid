export type ManifestMatchCondition = {
    node_comfy_class?: string;
    node_constructor_name?: string;
    widget_class_name?: string;
    widget_name?: string;
    widget_type?: string;
};

export type ManifestWidgetDef = {
    match: ManifestMatchCondition | ManifestMatchCondition[];
    custom_element: string;
    template?: string;
    template_id?: string;
};

export type ManifestIgnoreCondition = {
    comfy_class?: string;
    constructor_name?: string;
    widget_class_name?: string;
    widget_name?: string;
};

export type ExtensionManifest = {
    id: string;
    name: string;
    version?: string;
    description?: string;
    author?: string;
    python?: {
        install?: string;
        entry?: string;
    };
    frontend?: {
        scripts?: string[];
        styles?: string[];
        widgets?: ManifestWidgetDef[];
    };
    widgets?: ManifestWidgetDef[];
    ignore?: ManifestIgnoreCondition[];
};
