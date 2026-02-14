'use client';

import React from 'react';
import { Accordion, AccordionItem } from '@heroui/accordion';
import { Checkbox } from '@heroui/checkbox';
import { Spinner } from '@heroui/spinner';
import { Chip } from '@heroui/chip';
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

const PropertyItem: React.FC<PropertyItemProps> = ({
    property,
    level,
    expandedState,
    onToggleExpanded,
    selectedFilters,
    onFilterToggle,
}) => {
    const isExpanded = expandedState[property.id] || false;
    const hasChildren = property.children && property.children.length > 0;
    const hasValues = property.values && property.values.length > 0;

    // Indentation based on level
    const indentStyle = { paddingLeft: `${level * 12}px` };

    const handleCategoryClick = () => {
        if (hasChildren || hasValues) {
            onToggleExpanded(property.id);
        }
    };

    const handleValueClick = (valueId: number) => {
        onFilterToggle(valueId);
    };

    return (
        <div className="w-full" style={indentStyle}>
            {/* Property Category Header */}
            <button
                onClick={handleCategoryClick}
                className={`
                    w-full flex items-center justify-between py-2 px-0
                    ${hasChildren || hasValues ? 'cursor-pointer hover:bg-default-100 rounded-md' : 'cursor-default'}
                    transition-colors
                `}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {(hasChildren || hasValues) && (
                        <span className={`text-default-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                            ▶
                        </span>
                    )}
                    <p className={`
                        font-medium text-xs leading-4 tracking-wide uppercase
                        ${isExpanded ? 'text-primary' : 'text-default-600'}
                        wrap-break-word
                    `}>
                        {property.name}
                    </p>
                    {property.hidden && (
                        <Chip size="sm" variant="flat" color="warning" className="h-4 text-[10px]">Hidden</Chip>
                    )}
                    {!property.hidden && property.effective_hidden && (
                        <Chip size="sm" variant="flat" color="default" className="h-4 text-[10px]">Inherited Hidden</Chip>
                    )}
                </div>
            </button>

            {/* Property Values (if any and if expanded) */}
            {hasValues && isExpanded && (
                <div className="mt-1 ml-4 space-y-1">
                    {property.values.map((value: PropertyValue) => {
                        const isSelected = selectedFilters.includes(value.id);

                        return (
                            <div
                                key={value.id}
                                className={`
                                    flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer
                                    transition-colors hover:bg-default-100
                                    ${isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                                `}
                                onClick={() => handleValueClick(value.id)}
                            >
                                <Checkbox
                                    isSelected={isSelected}
                                    size="sm"
                                    color="primary"
                                    onValueChange={() => handleValueClick(value.id)}
                                />
                                <span className={`
                                    text-xs capitalize
                                    ${isSelected ? 'text-primary font-medium' : 'text-default-600'}
                                `}>
                                    {value.value}
                                </span>
                                {value.hidden && (
                                    <Chip size="sm" variant="flat" color="warning" className="h-4 text-[10px] ml-auto">Hidden</Chip>
                                )}
                                {!value.hidden && value.effective_hidden && (
                                    <Chip size="sm" variant="flat" color="default" className="h-4 text-[10px] ml-auto">Inherited</Chip>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Recursive Children */}
            {hasChildren && isExpanded && (
                <div className="mt-2">
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
    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4">
                <Spinner size="sm" />
                <span className="ml-2 text-default-500 text-xs">Loading filters...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4">
                <p className="text-danger text-xs">Error loading filters</p>
            </div>
        );
    }

    if (!properties || properties.length === 0) {
        return (
            <div className="p-4">
                <p className="text-default-500 text-xs">No filters available</p>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            {properties.map((item: Property) => {
                // Check if this is a root-level PropertyValue (has 'value' field, no 'name')
                if ('value' in item && !('name' in item)) {
                    // Root-level PropertyValue - render as a standalone filter
                    const isSelected = selectedFilters.includes(item.id);
                    return (
                        <div
                            key={item.id}
                            className={`
                                flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer
                                transition-colors hover:bg-default-100
                                ${isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                            `}
                            onClick={() => onFilterToggle(item.id)}
                        >
                            <Checkbox
                                isSelected={isSelected}
                                size="sm"
                                color="primary"
                                onValueChange={() => onFilterToggle(item.id)}
                            />
                            <span className={`
                                text-xs capitalize
                                ${isSelected ? 'text-primary font-medium' : 'text-default-600'}
                            `}>
                                {item.value}
                            </span>
                        </div>
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
