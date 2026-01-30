"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Hook to track browser tab/document visibility.
 * Returns whether the current tab is visible to the user.
 * 
 * Use this to pause expensive operations (like video playback)
 * when the user switches to another tab.
 */
export function useTabVisibility(): boolean {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Set initial state based on current visibility
        setIsVisible(document.visibilityState === "visible");

        const handleVisibilityChange = () => {
            setIsVisible(document.visibilityState === "visible");
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);

    return isVisible;
}

/**
 * Hook to run a callback when tab visibility changes.
 * Useful for pausing/resuming operations based on tab visibility.
 */
export function useOnTabVisibilityChange(
    onVisible: () => void,
    onHidden: () => void
): void {
    const handleVisibilityChange = useCallback(() => {
        if (document.visibilityState === "visible") {
            onVisible();
        } else {
            onHidden();
        }
    }, [onVisible, onHidden]);

    useEffect(() => {
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [handleVisibilityChange]);
}
