import type { Completion } from '@codemirror/autocomplete';

export type TagSourceType = 'danbooru' | 'e621' | 'both';

export interface PilotCompletion extends Completion {
    source?: TagSourceType;
    sources?: TagSourceType[];
    item?: ItemProps;
}

export interface TagModel {
    value: string;
    values: string[];
    flatValue: string;
    category: string;
    useCount: number;
    postCount: number;
    consequentTagModel?: TagModel | null;
    isOfficial: boolean;
    source?: TagSourceType;
    sources?: TagSourceType[];
}

export interface LoraModel {
    value: string;
    searchWords: string[];
    previewFile?: string | null;
}

export interface ItemProps {
    value: string;
    matchedWords: { word: string; index: number }[];
    category: string;
    exists: boolean;
    useCount: number;
    postCount: number;
    consequentTagModel: TagModel | null;
    isOfficial: boolean;
    previewFile: string | null;
    source?: TagSourceType;
    sources?: TagSourceType[];
}

export interface Word {
    value: string;
    position: number;
    type: 'tag' | 'lora';
    isActive: boolean;
}

export interface PromptInfo {
    prompt: string;
    caretPosition: number;
    inputtingString: string;
    activeWordIndex: number;
    words: Word[];
}

export interface InsertionInfo {
    isMetaBlock: boolean;
    needPrependComma: boolean;
    needPrependSpace: boolean;
}

export interface ParseResult {
    promptInfo: PromptInfo;
    insertionInfo: InsertionInfo;
}

export type RawTagData =
    | [number, string | number, string[]?]
    | {
          post_count: number;
          category: string | number;
          is_deprecated?: boolean;
          aliases?: string[];
          use_count?: number;
      };

export interface ResponseData {
    version?: number;
    tagModels: Record<string, RawTagData>;
    loraModels?: Record<
        string,
        {
            search_words?: string[];
            preview_file?: string;
        }
    >;
}
