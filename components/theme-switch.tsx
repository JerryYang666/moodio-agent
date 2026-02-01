"use client";

import { FC } from "react";
import { useTheme } from "next-themes";
import { useIsSSR } from "@react-aria/ssr";
import { useTranslations } from "next-intl";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { Tooltip } from "@heroui/tooltip";
import { SunMedium, MoonStar, MonitorCog } from "lucide-react";
import clsx from "clsx";

export interface ThemeSwitchProps {
  className?: string;
}

export const ThemeSwitch: FC<ThemeSwitchProps> = ({ className }) => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isSSR = useIsSSR();
  const t = useTranslations("theme");

  // Get the icon based on current theme setting
  const getThemeIcon = () => {
    if (isSSR) return <SunMedium size={20} />;
    
    if (theme === "system") {
      return <MonitorCog size={20} />;
    }
    
    // For light/dark, show the actual theme icon
    return resolvedTheme === "light" ? (
      <SunMedium size={20} />
    ) : (
      <MoonStar size={20} />
    );
  };

  return (
    <Dropdown>
      <Tooltip content={t("switchTheme")} placement="right" closeDelay={0}>
        <div>
          <DropdownTrigger>
            <Button
              isIconOnly
              variant="light"
              aria-label={t("switchTheme")}
              className={clsx(
                "min-w-unit-8 w-unit-8 h-unit-8 text-default-500",
                className
              )}
            >
              {getThemeIcon()}
            </Button>
          </DropdownTrigger>
        </div>
      </Tooltip>
      <DropdownMenu
        aria-label={t("switchTheme")}
        selectionMode="single"
        selectedKeys={new Set([theme || "system"])}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          setTheme(selected);
        }}
      >
        <DropdownItem
          key="light"
          startContent={<SunMedium size={18} />}
        >
          {t("light")}
        </DropdownItem>
        <DropdownItem
          key="dark"
          startContent={<MoonStar size={18} />}
        >
          {t("dark")}
        </DropdownItem>
        <DropdownItem
          key="system"
          startContent={<MonitorCog size={18} />}
        >
          {t("system")}
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
};
