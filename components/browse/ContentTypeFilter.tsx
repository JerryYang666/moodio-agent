'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Film, Image, Layers } from 'lucide-react';

// Content types are intentionally hardcoded to match server enum.
const CONTENT_TYPES = ['shot', 'image', 'multishot'] as const;

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  shot: <Film size={13} />,
  image: <Image size={13} />,
  multishot: <Layers size={13} />,
};

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
      onChange(selectedTypes.filter(t => t !== type));
    } else {
      onChange([...selectedTypes, type]);
    }
  };

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-default-400">
        {t("contentType")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CONTENT_TYPES.map((type) => {
          const isSelected = selectedTypes.includes(type);
          return (
            <button
              key={type}
              onClick={() => handleToggle(type)}
              className={`
                inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                transition-all duration-200 ease-out select-none
                ${isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                  : 'bg-default-100 text-default-600 hover:bg-default-200 hover:text-default-700'
                }
              `}
            >
              {CONTENT_TYPE_ICONS[type]}
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          );
        })}
      </div>
    </div>
  );
};
