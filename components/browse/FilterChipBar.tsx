'use client';

import React from 'react';
import { Chip } from '@heroui/chip';
import { X } from 'lucide-react';

export interface FilterChip {
    id: number;
    label: string;
}

export interface FilterChipBarProps {
    // Context text
    contextText?: string;  // e.g., "Browse all shots:" or "Showing shots for 'query':"

    // Chips
    filterChips: FilterChip[];
    onRemoveFilter: (filterId: number) => void;

    // Search term (optional separate chip)
    searchTerm?: string;
    onClearSearch?: () => void;
}

export function FilterChipBar({
    contextText = "Browse all shots:",
    filterChips,
    onRemoveFilter,
    searchTerm,
    onClearSearch,
}: FilterChipBarProps) {
    return (
        <div className="flex items-center gap-2 flex-wrap mb-4">
            {/* Context text */}
            <p className="font-normal text-xs leading-4 text-default-500">
                {contextText}
            </p>

            {/* Applied filter tags */}
            {filterChips.map((chip) => (
                <Chip
                    key={chip.id}
                    variant="flat"
                    color="primary"
                    size="sm"
                    onClose={() => onRemoveFilter(chip.id)}
                    endContent={<X size={12} />}
                >
                    {chip.label}
                </Chip>
            ))}

            {/* Search term tag (if search is active) */}
            {searchTerm && onClearSearch && (
                <Chip
                    variant="flat"
                    color="primary"
                    size="sm"
                    onClose={onClearSearch}
                    endContent={<X size={12} />}
                >
                    &quot;{searchTerm}&quot;
                </Chip>
            )}
        </div>
    );
}
