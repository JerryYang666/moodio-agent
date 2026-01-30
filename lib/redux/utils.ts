import type { QueryState } from "./types";

/**
 * Converts Redux query state to URL query parameters for API calls
 * 
 * Note: cursor and searchId are included for pagination continuation.
 * Intent parameters (textSearch, filters, etc.) are always sent to allow
 * recomputation if searchId is missing/expired.
 */
export const buildApiQueryParams = (queryState: QueryState): URLSearchParams => {
  const params = new URLSearchParams();

  if (queryState.textSearch.trim()) {
    params.append("text_search", queryState.textSearch.trim());
  }

  if (queryState.selectedFolders.length > 0) {
    params.append("selected_folders", queryState.selectedFolders.join(","));
  }

  if (queryState.selectedFilters.length > 0) {
    params.append("selected_filters", queryState.selectedFilters.join(","));
  }

  // Content types: multi-select with OR semantics (CSV format)
  if (queryState.contentTypes.length > 0) {
    params.append("content_type", queryState.contentTypes.join(","));
  }

  // AI-generated content filter: undefined = all (omit param), true = AIGC only, false = non-AIGC only
  if (queryState.isAigc !== undefined) {
    params.append("is_aigc", queryState.isAigc.toString());
  }

  // Pagination parameters (cursor-based)
  if (queryState.searchId) {
    params.append("search_id", queryState.searchId);
  }

  if (queryState.cursor) {
    params.append("cursor", queryState.cursor);
  }

  return params;
};

/**
 * Helper to build the full API URL with query parameters
 */
export const buildVideosApiUrl = (baseUrl: string, queryState: QueryState): string => {
  const params = buildApiQueryParams(queryState);
  return `${baseUrl}?${params.toString()}`;
};
