'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Camera } from 'lucide-react';

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
      onChange(undefined);
    } else {
      onChange(type);
    }
  };

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-default-400">
        {t("source")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => handleToggle('ai')}
          className={`
            inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
            transition-all duration-200 ease-out select-none
            ${value === 'ai'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
              : 'bg-default-100 text-default-600 hover:bg-default-200 hover:text-default-700'
            }
          `}
        >
          <Sparkles size={13} />
          {t("sourceAi")}
        </button>
        <button
          onClick={() => handleToggle('non_ai')}
          className={`
            inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
            transition-all duration-200 ease-out select-none
            ${value === 'non_ai'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
              : 'bg-default-100 text-default-600 hover:bg-default-200 hover:text-default-700'
            }
          `}
        >
          <Camera size={13} />
          {t("sourceNonAi")}
        </button>
      </div>
    </div>
  );
};
