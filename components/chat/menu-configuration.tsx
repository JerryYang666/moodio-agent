"use client";

import React, { useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { Tooltip } from "@heroui/tooltip";
import { MENU_CONFIG } from "@/config/menu-config";
import {
  WandSparkles,
  Pencil,
  MessageSquare,
  Sparkles,
  Info,
  ChevronUp,
} from "lucide-react";
import { AspectRatioIcon } from "./aspect-ratio-icon";

const ICON_MAP: Record<string, React.ElementType> = {
  WandSparkles,
  Pencil,
  MessageSquare,
  Sparkles,
};

export type MenuState = {
  mode: string;
  model: string;
  expertise: string;
  aspectRatio: string;
};

// Default initial state
export const INITIAL_MENU_STATE: MenuState = {
  mode: MENU_CONFIG.categories.mode.default,
  model: MENU_CONFIG.categories.model.default,
  expertise: MENU_CONFIG.categories.expertise.default,
  aspectRatio: MENU_CONFIG.categories.aspectRatio.default,
};

// Helper to resolve state based on mode and rules
export const resolveMenuState = (
  currentState: MenuState,
  newMode?: string
): MenuState => {
  const mode = newMode || currentState.mode;
  // Valid mode check
  if (
    !MENU_CONFIG.categories.mode.options[
      mode as keyof typeof MENU_CONFIG.categories.mode.options
    ]
  ) {
    // Fallback to default mode if invalid
    return resolveMenuState({
      ...currentState,
      mode: MENU_CONFIG.categories.mode.default,
    });
  }

  const context =
    MENU_CONFIG.contexts[mode as keyof typeof MENU_CONFIG.contexts];
  const defaults = context.defaults;
  const availability = context.availability;

  const newState = { ...currentState, mode };

  // Categories to resolve
  const categories = ["model", "expertise", "aspectRatio"] as const;

  categories.forEach((category) => {
    const categoryConfig = availability[category];
    const categoryDefaults = (defaults as any)[category]; // Mode-specific default
    const globalDefault = MENU_CONFIG.categories[category].default;

    if (!categoryConfig.enabled) {
      // If disabled, we might want to clear it or keep it as is but it won't be shown/used
      // The prompt says: "Hide or disable category. Clear its value from state"
      // But clearing it might mean empty string? Or just keep it but ignore it?
      // Prompt: "Clear its value from state"
      // Let's set it to empty string or null if allowed, but our type is string.
      // Let's set it to the default so it has a valid value if re-enabled, or just keep it?
      // "Clear its value from state" -> maybe ""?
      // But Dropdown expects a value.
      // Let's use the mode-specific default or global default as a "safe" placeholder even if hidden.
      // Actually, if it's disabled, the UI won't show it.
      // Let's follow "Replace with context.defaults[category] Else fallback to global default" from step 2 for "If current value not in allowed".
      // But for "If enabled === false", it says "Clear its value from state".
      // I'll set it to "" for now to indicate disabled/cleared.
      newState[category] = "";
    } else {
      // It is enabled
      const allowed = categoryConfig.allowed;
      const currentValue = newState[category];

      // If we just switched mode, we might want to apply defaults if configured?
      // "Defaults may change when Mode changes"
      // "Context Defaults ... Applied when switching into this mode"
      if (newMode && categoryDefaults) {
        // If we are switching mode, prefer the mode default
        newState[category] = categoryDefaults;
      } else {
        // Check if current value is allowed
        if (!(allowed as readonly string[]).includes(currentValue)) {
          // Invalid selection
          if (categoryDefaults) {
            newState[category] = categoryDefaults;
          } else {
            newState[category] = globalDefault;
          }
        }
      }
    }
  });

  return newState;
};

interface MenuConfigurationProps {
  state: MenuState;
  onStateChange: (newState: MenuState) => void;
  hasSelectedImages?: boolean;
}

export default function MenuConfiguration({
  state,
  onStateChange,
  hasSelectedImages = false,
}: MenuConfigurationProps) {
  const t = useTranslations("menu");
  const getCategoryLabel = (
    categoryKey: "model" | "expertise" | "aspectRatio"
  ) => t(categoryKey);
  const getModeLabel = (key: string) => t(`modes.${key}`);
  const getModeDescription = (key: string) => t(`modes.${key}Desc`);
  const getModelLabel = (key: string) => t(`models.${key}`);
  const getExpertiseLabel = (key: string) => t(`expertiseOptions.${key}`);
  const getAspectRatioLabel = (key: string) => t(`aspectRatioOptions.${key}`);
  const getAspectRatioDescription = (key: string) =>
    key === "smart" ? t("aspectRatioOptions.smartDesc") : undefined;
  // Handlers for changes
  const handleModeChange = (keys: any) => {
    const selected = Array.from(keys)[0] as string;
    if (selected && selected !== state.mode) {
      const newState = resolveMenuState(state, selected);
      onStateChange(newState);
    }
  };

  const handleCategoryChange = (category: keyof MenuState, keys: any) => {
    const selected = Array.from(keys)[0] as string;
    if (selected) {
      onStateChange({ ...state, [category]: selected });
    }
  };

  const currentContext =
    MENU_CONFIG.contexts[state.mode as keyof typeof MENU_CONFIG.contexts];

  // Render a dropdown for a category
  const renderDropdown = (
    categoryKey: "model" | "expertise" | "aspectRatio"
  ) => {
    const availability = currentContext.availability[categoryKey];

    if (!availability.enabled) {
      return null; // Or show disabled? Prompt: "Hide or disable category... Clear its value from state"
      // Prompt 10: "Disabled categories may be: Hidden entirely OR Shown disabled with reason tooltip"
      // Let's hide for cleanliness as per "Clear its value from state" usually implies it's gone.
      // But let's check if the user wants visibility. "Some categories may disappear". OK, hide.
    }

    const categoryDef = MENU_CONFIG.categories[categoryKey];
    const options = categoryDef.options;
    const allowedKeys = availability.allowed;

    const selectedKey = state[categoryKey];
    const selectedLabel =
      categoryKey === "model"
        ? getModelLabel(selectedKey)
        : categoryKey === "expertise"
          ? getExpertiseLabel(selectedKey)
          : getAspectRatioLabel(selectedKey);
    const isAspectRatio = categoryKey === "aspectRatio";

    // Get icon for aspect ratio options (if defined in config)
    const getAspectRatioIcon = (key: string, size: number) => {
      const option = (options as any)[key];
      if (option?.icon && ICON_MAP[option.icon]) {
        const Icon = ICON_MAP[option.icon];
        return <Icon size={size} className="text-default-500" />;
      }
      return (
        <AspectRatioIcon ratio={key} size={size} className="text-default-500" />
      );
    };

    return (
      <div key={categoryKey} className="flex flex-col gap-0.5">
        <span className="text-[10px] text-default-400 uppercase tracking-wide pl-1">
          {getCategoryLabel(categoryKey)}
        </span>
        <Dropdown>
          <DropdownTrigger>
            <Button
              className="capitalize"
              variant="bordered"
              size="sm"
              startContent={
                isAspectRatio ? getAspectRatioIcon(selectedKey, 16) : undefined
              }
              endContent={<ChevronUp size={14} className="text-default-400" />}
            >
              {selectedLabel}
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            disallowEmptySelection
            aria-label={t("selectCategory", {
              category: getCategoryLabel(categoryKey),
            })}
            selectedKeys={new Set([selectedKey])}
            selectionMode="single"
            variant="flat"
            onSelectionChange={(keys) =>
              handleCategoryChange(categoryKey, keys)
            }
          >
            {allowedKeys.map((key) => {
              const description =
                categoryKey === "aspectRatio"
                  ? getAspectRatioDescription(key)
                  : undefined;
              const hasDescription = Boolean(description);
              const optionLabel =
                categoryKey === "model"
                  ? getModelLabel(key)
                  : categoryKey === "expertise"
                    ? getExpertiseLabel(key)
                    : getAspectRatioLabel(key);

              return (
                <DropdownItem
                  key={key}
                  startContent={
                    isAspectRatio ? getAspectRatioIcon(key, 20) : undefined
                  }
                  endContent={
                    hasDescription ? (
                      <Tooltip content={description} placement="right">
                        <Info
                          size={14}
                          className="text-default-400 hover:text-default-600 cursor-help"
                        />
                      </Tooltip>
                    ) : undefined
                  }
                >
                  {optionLabel || key}
                </DropdownItem>
              );
            })}
          </DropdownMenu>
        </Dropdown>
      </div>
    );
  };

  // Render Mode Dropdown
  const renderModeDropdown = () => {
    const categoryDef = MENU_CONFIG.categories.mode;
    const selectedKey = state.mode;
    const selectedLabel = categoryDef.options[
      selectedKey as keyof typeof categoryDef.options
    ]
      ? getModeLabel(selectedKey)
      : selectedKey;
    const selectedIconName = (
      categoryDef.options[
        selectedKey as keyof typeof categoryDef.options
      ] as any
    ).icon;
    const SelectedIcon = selectedIconName ? ICON_MAP[selectedIconName] : null;

    // Different colors for different modes
    const modeColors: Record<string, "primary" | "secondary" | "success"> = {
      create: "primary",
      edit: "secondary",
      chat: "success",
    };
    const buttonColor = modeColors[selectedKey] || "primary";

    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-default-400 uppercase tracking-wide pl-1">
          {t("mode")}
        </span>
        <Dropdown>
          <DropdownTrigger>
            <Button
              className="capitalize font-medium"
              variant="flat"
              color={buttonColor}
              size="sm"
              startContent={
                SelectedIcon ? <SelectedIcon size={16} /> : undefined
              }
              endContent={<ChevronUp size={14} />}
            >
              {selectedLabel}
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            disallowEmptySelection
            aria-label={t("selectMode")}
            selectedKeys={new Set([selectedKey])}
            selectionMode="single"
            variant="flat"
            onSelectionChange={handleModeChange}
            disabledKeys={!hasSelectedImages ? ["edit"] : []}
          >
            {Object.entries(categoryDef.options).map(([key, value]) => {
              const Icon = (value as any).icon
                ? ICON_MAP[(value as any).icon]
                : null;
              const description = getModeDescription(key);
              const hasDescription = Boolean(description);
              const isEditDisabled = key === "edit" && !hasSelectedImages;
              const tooltipContent = isEditDisabled
                ? t("editModeHint")
                : description;
              const showTooltip = hasDescription || isEditDisabled;
              return (
                <DropdownItem
                  key={key}
                  startContent={
                    Icon ? (
                      <Icon size={20} className="text-default-500" />
                    ) : undefined
                  }
                  endContent={
                    showTooltip ? (
                      <Tooltip content={tooltipContent} placement="right">
                        <Info
                          size={14}
                          className="text-default-400 hover:text-default-600 cursor-help"
                        />
                      </Tooltip>
                    ) : undefined
                  }
                >
                  {getModeLabel(key)}
                </DropdownItem>
              );
            })}
          </DropdownMenu>
        </Dropdown>
      </div>
    );
  };

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-2 px-2">
      <div className="flex gap-2 items-center p-2 bg-transparent pt-0 rounded-lg min-w-max">
        {renderModeDropdown()}
        <span className="text-default-400 text-sm mx-1 mt-4">{t("with")}</span>
        {renderDropdown("model")}
        {renderDropdown("expertise")}
        {renderDropdown("aspectRatio")}
      </div>
    </div>
  );
}
