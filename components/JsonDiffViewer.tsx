"use client";

import { useMemo } from "react";
import { diffLines, Change } from "diff";

interface JsonDiffViewerProps {
  oldValue: any;
  newValue: any;
}

export default function JsonDiffViewer({
  oldValue,
  newValue,
}: JsonDiffViewerProps) {
  const diff = useMemo(() => {
    const oldJson = JSON.stringify(oldValue, null, 2);
    const newJson = JSON.stringify(newValue, null, 2);
    return diffLines(oldJson, newJson);
  }, [oldValue, newValue]);

  const renderDiffLine = (change: Change, index: number) => {
    let bgColor = "transparent";
    let textColor = "inherit";
    let prefix = " ";

    if (change.added) {
      bgColor = "rgba(34, 197, 94, 0.2)"; // green
      textColor = "rgb(22, 163, 74)";
      prefix = "+";
    } else if (change.removed) {
      bgColor = "rgba(239, 68, 68, 0.2)"; // red
      textColor = "rgb(220, 38, 38)";
      prefix = "-";
    }

    return (
      <div
        key={index}
        style={{
          backgroundColor: bgColor,
          color: textColor,
          padding: "2px 8px",
          fontFamily: "monospace",
          fontSize: "13px",
          whiteSpace: "pre",
          borderLeft: change.added
            ? "3px solid rgb(34, 197, 94)"
            : change.removed
              ? "3px solid rgb(239, 68, 68)"
              : "3px solid transparent",
        }}
      >
        <span style={{ opacity: 0.5, marginRight: "8px" }}>{prefix}</span>
        {change.value
          .split("\n")
          .map((line, lineIndex) =>
            lineIndex < change.value.split("\n").length - 1 ? (
              <div key={lineIndex}>{line}</div>
            ) : line ? (
              <div key={lineIndex}>{line}</div>
            ) : null
          )}
      </div>
    );
  };

  const hasChanges = diff.some((change) => change.added || change.removed);

  if (!hasChanges) {
    return (
      <div className="p-4 text-center text-default-500">
        No changes detected
      </div>
    );
  }

  return (
    <div
      style={{
        maxHeight: "70vh",
        overflow: "auto",
        border: "1px solid rgba(100, 100, 100, 0.2)",
        borderRadius: "8px",
        backgroundColor: "rgba(0, 0, 0, 0.05)",
      }}
    >
      {diff.map((change, index) => renderDiffLine(change, index))}
    </div>
  );
}
