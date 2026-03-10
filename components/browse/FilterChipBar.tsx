'use client';

import React from 'react';
import { Chip } from '@heroui/chip';
import { X } from 'lucide-react';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

export interface FilterChip {
    id: number;
    label: string;
    description?: string | null;
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
    contextText,
    filterChips,
    onRemoveFilter,
    searchTerm,
    onClearSearch,
}: FilterChipBarProps) {
    // Show highlight text when exactly one filter is selected and there is no search term
    const singleSelectedFilter =
        filterChips.length === 1 && !searchTerm
            ? filterChips[0]
            : null;

    return (
        <div className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
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

            {/* Single filter highlight */}
            {singleSelectedFilter && (
                <div className="mt-2">
                    <p className="text-2xl font-semibold leading-tight text-foreground">
                        {singleSelectedFilter.label}
                    </p>
                    {singleSelectedFilter.description && (
                        <div className="mt-1 text-base font-medium text-default-700 leading-relaxed">
                            <MarkdownRenderer
                                externalLinksNewTab
                                linkClassName="text-primary underline underline-offset-2"
                                components={{
                                    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
                                    ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-5 mb-2 last:mb-0">{children}</ul>,
                                    ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-5 mb-2 last:mb-0">{children}</ol>,
                                    li: ({ children }: { children?: React.ReactNode }) => <li className="mb-1 last:mb-0">{children}</li>,
                                }}
                            >
                                {singleSelectedFilter.description}
                            </MarkdownRenderer>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
