"use client";

import { useTranslations } from "next-intl";
import { Accordion, AccordionItem } from "@heroui/accordion";
import { Checkbox } from "@heroui/checkbox";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Users } from "lucide-react";
import { useTeams } from "@/hooks/use-team";
import { useGetTeamMembersQuery } from "@/lib/redux/services/next-api";
import type { ShareEntry } from "@/hooks/use-share-modal";

interface TeamMemberPickerProps {
  ownerId: string;
  currentUserId: string;
  shares: ShareEntry[];
  selectedUserIds: Set<string>;
  onToggleUser: (userId: string) => void;
  onToggleTeam: (memberUserIds: string[]) => void;
}

function TeamMembersList({
  teamId,
  ownerId,
  currentUserId,
  shares,
  selectedUserIds,
  onToggleUser,
  onToggleTeam,
}: { teamId: string } & TeamMemberPickerProps) {
  const tShare = useTranslations("share");
  const { data: members = [], isLoading } = useGetTeamMembersQuery(teamId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-3">
        <Spinner size="sm" />
      </div>
    );
  }

  const sharedUserIds = new Set(shares.map((s) => s.sharedWithUserId));

  const selectableMembers = members.filter(
    (m) => m.userId !== currentUserId && m.userId !== ownerId
  );

  const selectableUnsharedIds = selectableMembers
    .filter((m) => !sharedUserIds.has(m.userId))
    .map((m) => m.userId);

  const allSelectableSelected =
    selectableUnsharedIds.length > 0 &&
    selectableUnsharedIds.every((uid) => selectedUserIds.has(uid));

  return (
    <div className="space-y-1">
      {selectableUnsharedIds.length > 0 && (
        <div className="px-2 pb-1">
          <Checkbox
            size="sm"
            isSelected={allSelectableSelected}
            onValueChange={() => onToggleTeam(selectableUnsharedIds)}
          >
            <span className="text-xs text-default-500">
              {tShare("selectAll")}
            </span>
          </Checkbox>
        </div>
      )}
      {members.map((member) => {
        const isSelf = member.userId === currentUserId;
        const isEntityOwner = member.userId === ownerId;
        const isAlreadyShared = sharedUserIds.has(member.userId);
        const isDisabled = isSelf || isEntityOwner || isAlreadyShared;
        const displayName =
          [member.firstName, member.lastName].filter(Boolean).join(" ") ||
          member.email;

        return (
          <div
            key={member.userId}
            className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-default-100"
          >
            <Checkbox
              size="sm"
              isSelected={selectedUserIds.has(member.userId)}
              isDisabled={isDisabled}
              onValueChange={() => onToggleUser(member.userId)}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">
                  {displayName}
                </span>
                {member.tag && (
                  <Chip size="sm" variant="flat" color="secondary" className="max-w-[120px]">
                    <span className="truncate">{member.tag}</span>
                  </Chip>
                )}
              </div>
              <p className="text-xs text-default-400 truncate">
                {member.email}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Chip size="sm" variant="flat" className="capitalize">
                {member.role}
              </Chip>
              {isEntityOwner && (
                <Chip size="sm" variant="flat" color="warning">
                  {tShare("owner")}
                </Chip>
              )}
              {isAlreadyShared && !isEntityOwner && (
                <Chip size="sm" variant="flat" color="primary">
                  {tShare("alreadyShared")}
                </Chip>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TeamMemberPicker({
  ownerId,
  currentUserId,
  shares,
  selectedUserIds,
  onToggleUser,
  onToggleTeam,
}: TeamMemberPickerProps) {
  const tShare = useTranslations("share");
  const { teams, isInAnyTeam, loading } = useTeams();

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!isInAnyTeam) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-default-400">
        <Users size={20} />
        <p className="text-sm">{tShare("noTeams")}</p>
      </div>
    );
  }

  return (
    <Accordion selectionMode="multiple" variant="bordered" className="px-0">
      {teams.map((team) => (
        <AccordionItem
          key={team.teamId}
          aria-label={team.teamName}
          title={
            <div className="flex items-center gap-2">
              <Users size={16} className="text-default-500" />
              <span className="text-sm font-medium">{team.teamName}</span>
              <Chip size="sm" variant="flat" className="capitalize">
                {team.role}
              </Chip>
            </div>
          }
        >
          <TeamMembersList
            teamId={team.teamId}
            ownerId={ownerId}
            currentUserId={currentUserId}
            shares={shares}
            selectedUserIds={selectedUserIds}
            onToggleUser={onToggleUser}
            onToggleTeam={onToggleTeam}
          />
        </AccordionItem>
      ))}
    </Accordion>
  );
}
