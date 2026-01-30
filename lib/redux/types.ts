// TypeScript interfaces for Redux state

export interface QueryState {
  textSearch: string;
  selectedFolders: number[];  // Parent property IDs (not currently used)
  selectedFilters: number[];  // Property value IDs
  contentTypes: string[];  // Content type filters (shot, multishot, image) - multi-select with OR semantics
  isAigc?: boolean;  // AI-generated content filter (undefined = all, true = AIGC only, false = non-AIGC only)
  cursor?: string | null;  // Base64-encoded cursor for pagination
  searchId?: string | null;  // Opaque search session ID for pagination
}

export interface UIState {
  showFilters: boolean;
}
