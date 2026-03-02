"use client";

import { useState } from "react";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { ChevronDown, ChevronUp, Table2, Clapperboard } from "lucide-react";
import type { MessageContentPart } from "@/lib/llm/types";

type AgentShotListPart = Extract<MessageContentPart, { type: "agent_shot_list" }>;

interface ShotListCardProps {
  part: AgentShotListPart;
}

export default function ShotListCard({ part }: ShotListCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isStreaming = part.status === "streaming";

  if (isStreaming) {
    return (
      <Card className="my-3 border border-secondary/20 bg-linear-to-br from-secondary/5 to-primary/5 dark:from-secondary/10 dark:to-primary/10">
        <CardBody className="p-4 flex items-center gap-3">
          <Spinner size="sm" />
          <span className="text-sm text-default-500">Generating shot list...</span>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="my-3 border border-secondary/20 bg-linear-to-br from-secondary/5 to-primary/5 dark:from-secondary/10 dark:to-primary/10">
      <CardBody className="p-0">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-3 p-3 hover:bg-default-100/50 transition-colors rounded-lg"
        >
          <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
            <Clapperboard size={16} className="text-secondary" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-semibold truncate">
              {part.title || "Shot List"}
            </div>
            <div className="text-xs text-default-400">
              {part.rows.length} shots &middot; {part.columns.length} columns
            </div>
          </div>
          <Chip size="sm" variant="flat" color="secondary" startContent={<Table2 size={12} />}>
            Table
          </Chip>
          {isExpanded ? (
            <ChevronUp size={16} className="text-default-400 shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-default-400 shrink-0" />
          )}
        </button>

        {isExpanded && (
          <div className="px-3 pb-3 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {part.columns.map((col, i) => (
                    <th
                      key={i}
                      className="px-2 py-1.5 text-left font-semibold text-default-600 bg-default-100 border border-divider whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {part.rows.map((row) => (
                  <tr key={row.id}>
                    {row.cells.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-2 py-1.5 border border-divider text-default-700 whitespace-pre-wrap"
                      >
                        {cell.value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
