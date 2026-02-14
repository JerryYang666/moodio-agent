import { useMemo } from 'react';
import type { TaxonomyPropertyNode } from '@/lib/filterGrouping';

export interface FilterChip {
    id: number;
    label: string;
}

export function useFilterChips(
    properties: TaxonomyPropertyNode[] | undefined,
    selectedFilters: number[]
): FilterChip[] {
    return useMemo(() => {
        if (!properties) return [];

        const map = new Map<number, string>();

        const buildMap = (propertyList: TaxonomyPropertyNode[], parentName?: string) => {
            for (const prop of propertyList) {
                // Handle root-level PropertyValues (has 'value' but no 'name')
                if ('value' in prop && prop.value && !prop.name) {
                    // This is a root-level PropertyValue
                    map.set(prop.id, prop.value);
                } else if (prop.name) {
                    // This is a regular Property with nested values
                    const propName = parentName ? `${parentName} > ${prop.name}` : prop.name;

                    // Map all values under this property
                    prop.values?.forEach((v) => {
                        map.set(v.id, v.value);
                    });

                    // Recursively process children
                    if (prop.children?.length > 0) {
                        buildMap(prop.children, propName);
                    }
                }
            }
        };

        buildMap(properties);

        return selectedFilters.map(id => ({
            id,
            label: map.get(id) || `Filter ${id}`,
        }));
    }, [properties, selectedFilters]);
}
