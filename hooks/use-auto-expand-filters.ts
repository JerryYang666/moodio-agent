import { useEffect, useRef } from 'react';
import type { Property } from '@/lib/redux/services/api';

function findPropertyPaths(properties: Property[], targetIds: number[]): Set<number> {
    const pathsToExpand = new Set<number>();

    const findPropertyValuePath = (
        property: Property,
        targetValueId: number,
        currentPath: number[] = []
    ): number[] | null => {
        const pathWithCurrent = [...currentPath, property.id];

        // Check if this property contains the target value
        const hasTargetValue = property.values?.some(v => v.id === targetValueId);
        if (hasTargetValue) {
            return pathWithCurrent;
        }

        // Recursively search children
        if (property.children) {
            for (const child of property.children) {
                const foundPath = findPropertyValuePath(child, targetValueId, pathWithCurrent);
                if (foundPath) {
                    return foundPath;
                }
            }
        }

        return null;
    };

    targetIds.forEach(filterId => {
        properties.forEach(property => {
            const path = findPropertyValuePath(property, filterId, []);
            if (path) {
                path.forEach(propId => pathsToExpand.add(propId));
            }
        });
    });

    return pathsToExpand;
}

export function useAutoExpandFilters(
    properties: Property[] | undefined,
    selectedFilters: number[],
    setExpandedState: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
) {
    const prevSelectedFiltersRef = useRef<number[]>([]);

    useEffect(() => {
        if (!properties || selectedFilters.length === 0) {
            prevSelectedFiltersRef.current = selectedFilters;
            return;
        }

        const newFilters = selectedFilters.filter(
            id => !prevSelectedFiltersRef.current.includes(id)
        );

        if (newFilters.length === 0) {
            prevSelectedFiltersRef.current = selectedFilters;
            return;
        }

        // Find paths to expand
        const pathsToExpand = findPropertyPaths(properties, newFilters);

        if (pathsToExpand.size > 0) {
            setExpandedState(prev => {
                const newExpanded = { ...prev };
                pathsToExpand.forEach(id => { newExpanded[id] = true; });
                return newExpanded;
            });
        }

        prevSelectedFiltersRef.current = selectedFilters;
    }, [properties, selectedFilters, setExpandedState]);
}
