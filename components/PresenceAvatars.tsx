"use client";

import React, { memo } from "react";
import { Tooltip } from "@heroui/tooltip";
import { useTranslations } from "next-intl";

export interface PresenceUser {
  userId: string;
  firstName: string;
  email: string;
  initial: string;
  sessionCount: number;
}

function userIdToHslColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

interface PresenceAvatarsProps {
  users: PresenceUser[];
}

export const PresenceAvatars = memo(function PresenceAvatars({
  users,
}: PresenceAvatarsProps) {
  const t = useTranslations("common");

  if (users.length === 0) return null;

  return (
    <div className="flex items-center -space-x-1.5">
      {users.map((user) => (
        <Tooltip
          key={user.userId}
          content={
            <div className="text-xs py-1 px-0.5">
              {user.firstName && (
                <div className="font-semibold">{user.firstName}</div>
              )}
              <div className="text-default-400">{user.email}</div>
              {user.sessionCount > 1 && (
                <div className="text-default-500 mt-0.5">
                  {t("tabsOpen", { count: user.sessionCount })}
                </div>
              )}
            </div>
          }
          placement="bottom"
        >
          <div
            className="relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-background cursor-default"
            style={{ backgroundColor: userIdToHslColor(user.userId) }}
          >
            {user.initial}
            {user.sessionCount > 1 && (
              <span className="absolute -top-1 -right-1 text-[8px] bg-foreground text-background rounded-full w-3.5 h-3.5 flex items-center justify-center border border-background">
                {user.sessionCount}
              </span>
            )}
          </div>
        </Tooltip>
      ))}
    </div>
  );
});
