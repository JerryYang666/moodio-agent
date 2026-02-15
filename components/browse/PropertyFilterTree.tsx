'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@heroui/checkbox';
import { Spinner } from '@heroui/spinner';
import { Chip } from '@heroui/chip';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import type { Property, PropertyValue } from '@/lib/redux/services/api';

interface ExpandedState {
    [propertyId: number]: boolean;
}

interface PropertyItemProps {
    property: Property;
    level: number;
    expandedState: ExpandedState;
    onToggleExpanded: (propertyId: number) => void;
    selectedFilters: number[];
    onFilterToggle: (filterId: number) => void;
}

/** Shared value-row component used by both PropertyItem and root-level values */
const ValueRow: React.FC<{
    value: PropertyValue;
    isSelected: boolean;
    onClick: () => void;
    t: ReturnType<typeof useTranslations>;
}> = ({ value, isSelected, onClick, t }) => (
    <div
        className={`
            group flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer
            transition-all duration-150 ease-out
            ${isSelected
                ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary/20'
                : 'hover:bg-default-100'
            }
        `}
        onClick={onClick}
    >
        <Checkbox
            isSelected={isSelected}
            size="sm"
            color="primary"
            onValueChange={onClick}
            classNames={{
                wrapper: "before:border-default-300",
            }}
        />
        <span className={`
            text-xs capitalize leading-4 flex-1
            transition-colors duration-150
            ${isSelected ? 'text-primary font-medium' : 'text-default-600 group-hover:text-default-800'}
        `}>
            {value.value}
        </span>
        {value.hidden && (
            <Chip size="sm" variant="flat" color="warning" className="h-4 text-[10px] ml-auto shrink-0">
                {t("hidden")}
            </Chip>
        )}
        {!value.hidden && value.effective_hidden && (
            <Chip size="sm" variant="flat" color="default" className="h-4 text-[10px] ml-auto shrink-0">
                {t("inherited")}
            </Chip>
        )}
    </div>
);

const PropertyItem: React.FC<PropertyItemProps> = ({
    property,
    level,
    expandedState,
    onToggleExpanded,
    selectedFilters,
    onFilterToggle,
}) => {
    const t = useTranslations("browse");
    const isExpanded = expandedState[property.id] || false;
    const hasChildren = property.children && property.children.length > 0;
    const hasValues = property.values && property.values.length > 0;
    const isExpandable = hasChildren || hasValues;

    // Count selected values under this property
    const selectedCount = property.values
        ? property.values.filter((v: PropertyValue) => selectedFilters.includes(v.id)).length
        : 0;

    return (
        <div className="w-full">
            {/* Property Category Header */}
            <button
                onClick={() => isExpandable && onToggleExpanded(property.id)}
                className={`
                    w-full flex items-center gap-1.5 py-2 px-2 rounded-lg
                    ${isExpandable ? 'cursor-pointer hover:bg-default-100' : 'cursor-default'}
                    transition-colors duration-150 ease-out group
                `}
            >
                {isExpandable && (
                    <ChevronRight
                        size={14}
                        className={`
                            text-default-400 shrink-0
                            transition-transform duration-200 ease-out
                            ${isExpanded ? 'rotate-90' : 'group-hover:translate-x-0.5'}
                        `}
                    />
                )}
                {/* Spacer when not expandable to maintain alignment */}
                {!isExpandable && <div className="w-3.5 shrink-0" />}

                <span className={`
                    font-semibold text-[11px] leading-4 tracking-wider uppercase flex-1 text-left
                    transition-colors duration-150
                    ${isExpanded ? 'text-primary' : 'text-default-500 group-hover:text-default-700'}
                    wrap-break-word
                `}>
                    {property.name}
                </span>

                {/* Selected count badge */}
                {selectedCount > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0">
                        {selectedCount}
                    </span>
                )}

                {property.hidden && (
                    <Chip size="sm" variant="flat" color="warning" className="h-4 text-[10px] shrink-0">
                        {t("hidden")}
                    </Chip>
                )}
                {!property.hidden && property.effective_hidden && (
                    <Chip size="sm" variant="flat" color="default" className="h-4 text-[10px] shrink-0">
                        {t("inheritedHidden")}
                    </Chip>
                )}
            </button>

            {/* Property Values (if any and if expanded) */}
            {hasValues && isExpanded && (
                <div className="ml-3 pl-2.5 border-l border-default-200 space-y-0.5 mb-1">
                    {property.values.map((value: PropertyValue) => (
                        <ValueRow
                            key={value.id}
                            value={value}
                            isSelected={selectedFilters.includes(value.id)}
                            onClick={() => onFilterToggle(value.id)}
                            t={t}
                        />
                    ))}
                </div>
            )}

            {/* Recursive Children */}
            {hasChildren && isExpanded && (
                <div className="ml-3 pl-2.5 border-l border-default-200 mb-1">
                    {property.children.map((childProperty: Property) => (
                        <PropertyItem
                            key={childProperty.id}
                            property={childProperty}
                            level={level + 1}
                            expandedState={expandedState}
                            onToggleExpanded={onToggleExpanded}
                            selectedFilters={selectedFilters}
                            onFilterToggle={onFilterToggle}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export interface PropertyFilterTreeProps {
    properties: Property[];
    selectedFilters: number[];
    expandedState: Record<number, boolean>;
    onToggleExpanded: (propertyId: number) => void;
    onFilterToggle: (filterId: number) => void;
    isLoading?: boolean;
    error?: unknown;
}

export function PropertyFilterTree({
    properties,
    selectedFilters,
    expandedState,
    onToggleExpanded,
    onFilterToggle,
    isLoading,
    error,
}: PropertyFilterTreeProps) {
    const t = useTranslations("browse");

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Spinner size="sm" color="primary" />
                <span className="text-default-400 text-xs">{t("loadingFilters")}</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 dark:bg-danger-900/20">
                <AlertTriangle size={14} className="text-danger shrink-0" />
                <p className="text-danger text-xs">{t("errorLoadingFilters")}</p>
            </div>
        );
    }

    if (!properties || properties.length === 0) {
        return (
            <div className="flex items-center justify-center py-8">
                <p className="text-default-400 text-xs">{t("noFiltersAvailable")}</p>
            </div>
        );
    }

    return (
        <div className="space-y-0.5">
            {properties.map((item: Property) => {
                // Check if this is a root-level PropertyValue (has 'value' field, no 'name')
                if ('value' in item && !('name' in item)) {
                    return (
                        <ValueRow
                            key={item.id}
                            value={item as unknown as PropertyValue}
                            isSelected={selectedFilters.includes(item.id)}
                            onClick={() => onFilterToggle(item.id)}
                            t={t}
                        />
                    );
                }

                // Regular Property node
                return (
                    <PropertyItem
                        key={item.id}
                        property={item}
                        level={0}
                        expandedState={expandedState}
                        onToggleExpanded={onToggleExpanded}
                        selectedFilters={selectedFilters}
                        onFilterToggle={onFilterToggle}
                    />
                );
            })}
        </div>
    );
}
