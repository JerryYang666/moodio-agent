'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Chip } from '@heroui/chip';

// Source filter values: 'ai' or 'non_ai', or undefined when neither selected (no filter)
export type SourceFilterValue = 'ai' | 'non_ai' | undefined;

interface AiGeneratedFilterProps {
  value: SourceFilterValue;
  onChange: (value: SourceFilterValue) => void;
}

export const AiGeneratedFilter: React.FC<AiGeneratedFilterProps> = ({
  value,
  onChange,
}) => {
  const t = useTranslations("browse");

  const handleToggle = (type: 'ai' | 'non_ai') => {
    if (value === type) {
      // Deselect: set to undefined (no filter)
      onChange(undefined);
    } else {
      // Select this type
      onChange(type);
    }
  };

  return (
    <div className="mb-2 pb-2 border-b border-divider">
      <label className="block mb-1.5">
        <p className="font-medium text-xs leading-4 tracking-wide uppercase text-default-600">
          {t("source")}
        </p>
      </label>
      <div className="flex flex-wrap gap-1">
        <Chip
          variant={value === 'ai' ? "solid" : "flat"}
          color={value === 'ai' ? "primary" : "default"}
          size="sm"
          className="cursor-pointer"
          onClick={() => handleToggle('ai')}
        >
          {t("sourceAi")}
        </Chip>
        <Chip
          variant={value === 'non_ai' ? "solid" : "flat"}
          color={value === 'non_ai' ? "primary" : "default"}
          size="sm"
          className="cursor-pointer"
          onClick={() => handleToggle('non_ai')}
        >
          {t("sourceNonAi")}
        </Chip>
      </div>
    </div>
  );
};
