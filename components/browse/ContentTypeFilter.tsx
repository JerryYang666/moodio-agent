'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Chip } from '@heroui/chip';

// Content types are intentionally hardcoded to match server enum.
const CONTENT_TYPES = ['shot', 'image', 'multishot'] as const;

interface ContentTypeFilterProps {
  selectedTypes: string[];
  onChange: (types: string[]) => void;
}

export const ContentTypeFilter: React.FC<ContentTypeFilterProps> = ({
  selectedTypes,
  onChange,
}) => {
  const t = useTranslations("browse");

  const handleToggle = (type: string) => {
    if (selectedTypes.includes(type)) {
      // Remove from selection
      onChange(selectedTypes.filter(t => t !== type));
    } else {
      // Add to selection
      onChange([...selectedTypes, type]);
    }
  };

  return (
    <div className="mb-2 pb-2 border-b border-divider">
      <label className="block mb-1.5">
        <p className="font-medium text-xs leading-4 tracking-wide uppercase text-default-600">
          {t("contentType")}
        </p>
      </label>
      <div className="flex flex-wrap gap-1">
        {CONTENT_TYPES.map((type) => {
          const isSelected = selectedTypes.includes(type);
          return (
            <Chip
              key={type}
              variant={isSelected ? "solid" : "flat"}
              color={isSelected ? "primary" : "default"}
              size="sm"
              className="cursor-pointer"
              onClick={() => handleToggle(type)}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Chip>
          );
        })}
      </div>
    </div>
  );
};
