"use client";

import React, {
    createContext,
    useContext,
    useRef,
    useEffect,
    useState,
    useCallback,
    type RefObject,
    type ReactNode,
} from "react";

// Zone configuration
const NEAR_ZONE_MARGIN = 450;  // px - videos within this start loading (approx 1.5 rows)
const FAR_ZONE_MARGIN = 900;   // px - videos beyond this get unloaded

// Visibility state for a single video element
interface VisibilityState {
    isVisible: boolean;        // Within viewport (should be playing)
    isNearViewport: boolean;   // Within NEAR_ZONE_MARGIN (should have src loaded)
    isFarFromViewport: boolean; // Beyond FAR_ZONE_MARGIN (should unload src)
}

// Context value provided to child components
interface VideoVisibilityContextValue {
    register: (element: HTMLVideoElement) => void;
    unregister: (element: HTMLVideoElement) => void;
    getState: (element: HTMLVideoElement) => VisibilityState;
    subscribe: (element: HTMLVideoElement, callback: (state: VisibilityState) => void) => () => void;
}

const VideoVisibilityContext = createContext<VideoVisibilityContextValue | null>(null);

// Default visibility threshold (25% visible to be considered "visible")
const VISIBILITY_THRESHOLD = 0.25;

interface VideoVisibilityProviderProps {
    children: ReactNode;
    /** Distance in pixels to preload videos before they enter viewport */
    nearMargin?: number;
    /** Distance in pixels beyond which videos should be unloaded */
    farMargin?: number;
}

/**
 * Provider component that creates shared IntersectionObservers for all videos.
 * Tracks three zones: visible, near (preload), and far (unload).
 */
export function VideoVisibilityProvider({
    children,
    nearMargin = NEAR_ZONE_MARGIN,
    farMargin = FAR_ZONE_MARGIN,
}: VideoVisibilityProviderProps) {
    // Two observers: one for near zone, one for far zone
    const nearObserverRef = useRef<IntersectionObserver | null>(null);
    const farObserverRef = useRef<IntersectionObserver | null>(null);

    // State tracking for each element
    const stateMapRef = useRef<Map<HTMLVideoElement, VisibilityState>>(new Map());
    const subscribersRef = useRef<Map<HTMLVideoElement, Set<(state: VisibilityState) => void>>>(new Map());

    // Track intersection state from each observer separately
    const nearIntersectionRef = useRef<Map<HTMLVideoElement, { isVisible: boolean; isNear: boolean }>>(new Map());
    const farIntersectionRef = useRef<Map<HTMLVideoElement, boolean>>(new Map()); // true = within far zone

    // Helper to compute and notify state changes
    const updateElementState = useCallback((element: HTMLVideoElement) => {
        const nearState = nearIntersectionRef.current.get(element) ?? { isVisible: false, isNear: false };
        const isWithinFarZone = farIntersectionRef.current.get(element) ?? false;

        const newState: VisibilityState = {
            isVisible: nearState.isVisible,
            isNearViewport: nearState.isNear,
            isFarFromViewport: !isWithinFarZone, // Far = NOT within the far zone observer
        };

        const currentState = stateMapRef.current.get(element);

        // Only update if state actually changed
        if (!currentState ||
            currentState.isVisible !== newState.isVisible ||
            currentState.isNearViewport !== newState.isNearViewport ||
            currentState.isFarFromViewport !== newState.isFarFromViewport) {

            stateMapRef.current.set(element, newState);

            // Notify subscribers
            const callbacks = subscribersRef.current.get(element);
            if (callbacks) {
                callbacks.forEach((cb) => cb(newState));
            }
        }
    }, []);

    // Initialize the near-zone observer (300px margin)
    useEffect(() => {
        const handleNearIntersection: IntersectionObserverCallback = (entries) => {
            entries.forEach((entry) => {
                const element = entry.target as HTMLVideoElement;
                nearIntersectionRef.current.set(element, {
                    isVisible: entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD,
                    isNear: entry.isIntersecting || entry.intersectionRatio > 0,
                });
                updateElementState(element);
            });
        };

        nearObserverRef.current = new IntersectionObserver(handleNearIntersection, {
            root: null,
            rootMargin: `${nearMargin}px 0px`,
            threshold: [0, VISIBILITY_THRESHOLD, 0.5, 1.0],
        });

        return () => {
            nearObserverRef.current?.disconnect();
            nearObserverRef.current = null;
        };
    }, [nearMargin, updateElementState]);

    // Initialize the far-zone observer (800px margin)
    useEffect(() => {
        const handleFarIntersection: IntersectionObserverCallback = (entries) => {
            entries.forEach((entry) => {
                const element = entry.target as HTMLVideoElement;
                // isIntersecting means the element is within the far zone (800px from viewport)
                farIntersectionRef.current.set(element, entry.isIntersecting);
                updateElementState(element);
            });
        };

        farObserverRef.current = new IntersectionObserver(handleFarIntersection, {
            root: null,
            rootMargin: `${farMargin}px 0px`,
            threshold: 0,
        });

        return () => {
            farObserverRef.current?.disconnect();
            farObserverRef.current = null;
        };
    }, [farMargin, updateElementState]);

    const register = useCallback((element: HTMLVideoElement) => {
        if (!element) return;

        // Calculate initial state synchronously
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        const isNear = rect.bottom >= -nearMargin && rect.top <= viewportHeight + nearMargin;
        const isVisible = rect.bottom >= 0 && rect.top <= viewportHeight;
        const isWithinFarZone = rect.bottom >= -farMargin && rect.top <= viewportHeight + farMargin;

        // Store initial intersection states
        nearIntersectionRef.current.set(element, { isVisible, isNear });
        farIntersectionRef.current.set(element, isWithinFarZone);

        const initialState: VisibilityState = {
            isVisible,
            isNearViewport: isNear,
            isFarFromViewport: !isWithinFarZone,
        };
        stateMapRef.current.set(element, initialState);

        // Notify subscribers of initial state
        const callbacks = subscribersRef.current.get(element);
        if (callbacks) {
            callbacks.forEach((cb) => cb(initialState));
        }

        // Start observing with both observers
        nearObserverRef.current?.observe(element);
        farObserverRef.current?.observe(element);
    }, [nearMargin, farMargin]);

    const unregister = useCallback((element: HTMLVideoElement) => {
        if (!element) return;

        nearObserverRef.current?.unobserve(element);
        farObserverRef.current?.unobserve(element);
        stateMapRef.current.delete(element);
        subscribersRef.current.delete(element);
        nearIntersectionRef.current.delete(element);
        farIntersectionRef.current.delete(element);
    }, []);

    const getState = useCallback((element: HTMLVideoElement): VisibilityState => {
        return stateMapRef.current.get(element) ?? {
            isVisible: false,
            isNearViewport: false,
            isFarFromViewport: true
        };
    }, []);

    const subscribe = useCallback(
        (element: HTMLVideoElement, callback: (state: VisibilityState) => void): (() => void) => {
            if (!subscribersRef.current.has(element)) {
                subscribersRef.current.set(element, new Set());
            }
            subscribersRef.current.get(element)!.add(callback);

            return () => {
                subscribersRef.current.get(element)?.delete(callback);
            };
        },
        []
    );

    const contextValue: VideoVisibilityContextValue = {
        register,
        unregister,
        getState,
        subscribe,
    };

    return (
        <VideoVisibilityContext.Provider value={contextValue}>
            {children}
        </VideoVisibilityContext.Provider>
    );
}

/**
 * Hook to track visibility of a video element within the grid.
 * Must be used inside a VideoVisibilityProvider.
 * 
 * @param ref - React ref attached to the video element
 * @returns Visibility state { isVisible, isNearViewport, isFarFromViewport }
 */
export function useVideoVisibility(ref: RefObject<HTMLVideoElement | null>): VisibilityState {
    const context = useContext(VideoVisibilityContext);
    const [state, setState] = useState<VisibilityState>({
        isVisible: false,
        isNearViewport: false,
        isFarFromViewport: true,
    });

    if (!context) {
        throw new Error("useVideoVisibility must be used within a VideoVisibilityProvider");
    }

    const { register, unregister, subscribe, getState } = context;

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        // Subscribe to visibility changes first
        const unsubscribe = subscribe(element, setState);

        // Register with the shared observers
        register(element);

        // Get initial state immediately after registration
        const initialState = getState(element);
        setState(initialState);

        return () => {
            unsubscribe();
            unregister(element);
        };
    }, [ref, register, unregister, subscribe, getState]);

    return state;
}
