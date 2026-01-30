import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { QueryState } from "../types";

export interface InfiniteContentResponse<TItem, TMetadata = unknown> {
    content: TItem[];
    has_more: boolean;
    total_content: number;
    cursor?: string | null;
    search_id?: string | null;
    search_metadata?: TMetadata | null;
}

interface UseInfiniteContentOptions<TItem, TQueryParams, TMetadata = unknown> {
    useQuery: (params: TQueryParams, options?: { skip?: boolean }) => {
        data?: InfiniteContentResponse<TItem, TMetadata>;
        currentData?: InfiniteContentResponse<TItem, TMetadata>; // Only returns data matching current args (no stale data during transitions)
        isFetching: boolean;
        isLoading: boolean;
        error?: unknown;
        refetch: () => void;
    };
    queryState: QueryState;
    buildQueryParams: (queryState: QueryState) => TQueryParams;
    actions: {
        setCursor: (cursor: string | null) => { type: string; payload: string | null };
        setSearchId: (searchId: string | null) => { type: string; payload: string | null };
    };
}

interface UseInfiniteContentResult<TItem, TMetadata = unknown> {
    items: TItem[];
    hasMore: boolean;
    totalItems: number;
    isLoading: boolean;
    isFetching: boolean;
    error: unknown;
    loadMore: () => void;
    refetch: () => void;
    searchKey: string; // Unique key that changes when search/filters change (for scroll reset)
    searchMetadata: TMetadata | null; // Search metadata (e.g., query_plan for text searches)
}

/**
 * Generic hook for infinite scroll with cursor-based pagination.
 *
 * This hook is a thin wrapper over RTK Query - all item accumulation is handled
 * by RTK Query's merge function in the API configuration. This ensures a single
 * source of truth and eliminates race conditions between component state and
 * RTK Query's cache during intent transitions (filter/search changes).
 */
export function useInfiniteContent<TItem, TQueryParams, TMetadata = unknown>({
    useQuery,
    queryState,
    buildQueryParams,
    actions,
}: UseInfiniteContentOptions<TItem, TQueryParams, TMetadata>): UseInfiniteContentResult<TItem, TMetadata> {
    const dispatch = useDispatch();
    const [ready, setReady] = useState(false);
    const pendingRef = useRef(false);

    // Store actions in a ref to avoid dependency issues
    const actionsRef = useRef(actions);
    actionsRef.current = actions;

    // Reset pagination on mount only
    useEffect(() => {
        dispatch(actionsRef.current.setCursor(null));
        dispatch(actionsRef.current.setSearchId(null));
        setReady(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount

    const queryParams = buildQueryParams(queryState);

    const {
        data,
        currentData,
        isFetching,
        isLoading,
        error,
        refetch,
    } = useQuery(queryParams, { skip: !ready });

    // Compute search key to identify when intent changes (search text, filters, etc.)
    // This is used by VirtualInfiniteScroll to reset scroll position
    const sortedContentTypes = [...(queryState.contentTypes || [])].sort().join(",");
    const searchKey = `${queryState.textSearch || ""}-${queryState.selectedFolders?.join(",") || ""}-${queryState.selectedFilters?.join(",") || ""}-${sortedContentTypes}-${queryState.isAigc ?? ""}`;

    // Sync search session ID with Redux when it changes
    // Use `data` here since we want to track searchId even during transitions
    useEffect(() => {
        if (data?.search_id && data.search_id !== queryState.searchId) {
            dispatch(actionsRef.current.setSearchId(data.search_id));
        }
    }, [data?.search_id, queryState.searchId, dispatch]);

    // Trigger loading of next page
    // Use `currentData` preferentially, but fall back to `data` during brief transition periods.
    // This prevents loadMore from failing during cursor changes when currentData is briefly undefined.
    const loadMore = useCallback(() => {
        const hasMore = currentData?.has_more ?? data?.has_more ?? false;
        const cursor = currentData?.cursor ?? data?.cursor;
        if (hasMore && !isFetching && !pendingRef.current && cursor) {
            pendingRef.current = true;
            dispatch(actionsRef.current.setCursor(cursor));
        }
    }, [currentData?.has_more, currentData?.cursor, data?.has_more, data?.cursor, isFetching, dispatch]);

    // Reset lock flag when fetching completes
    useEffect(() => {
        if (!isFetching) {
            pendingRef.current = false;
        }
    }, [isFetching]);

    // Use `currentData` instead of `data` to prevent flash of stale items during intent transitions.
    // `currentData` returns undefined when query args change, while `data` can briefly return
    // the previous subscription's data. This ensures we show loading state instead of wrong videos.
    const items = currentData?.content ?? [];

    // For hasMore and totalItems, fall back to `data` during cursor transitions.
    // This prevents hasMore from becoming false during pagination (cursor changes)
    // while still respecting intent changes (filter changes) where we want fresh data.
    // - During pagination: currentData is briefly undefined, but data.has_more is valid
    // - During filter change: data still has old values, but that's OK since we show loading state
    const hasMore = currentData?.has_more ?? data?.has_more ?? false;
    const totalItems = currentData?.total_content ?? data?.total_content ?? 0;

    // For search metadata, prefer currentData to avoid showing stale query plan
    const searchMetadata = (currentData?.search_metadata ?? null) as TMetadata | null;

    return {
        items,
        hasMore,
        totalItems,
        isLoading,
        isFetching,
        error,
        loadMore,
        refetch,
        searchKey,
        searchMetadata,
    };
}
