"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { GridSplitConfig } from "@/hooks/use-image-edit";

interface GridSplitOverlayProps {
  config: GridSplitConfig;
  onChange: (next: GridSplitConfig) => void;
  /** A min separation between adjacent cuts, expressed as a fraction. */
  minGap?: number;
}

const HANDLE_HIT_PX = 18;

/**
 * Visual overlay rendered on top of the image while the user is in
 * grid-split mode. Draws every horizontal/vertical cut as a line and lets
 * the user drag each one to a new fractional position. The image itself is
 * rendered by the parent — this component is a transparent absolute layer
 * sized to cover it.
 */
export default function GridSplitOverlay({
  config,
  onChange,
  minGap = 0.02,
}: GridSplitOverlayProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<
    | { axis: "v" | "h"; index: number }
    | null
  >(null);
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const handlePointerDown = useCallback(
    (axis: "v" | "h", index: number) =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setDrag({ axis, index });
      },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const next = { ...configRef.current };
      if (drag.axis === "v") {
        const cuts = next.verticalCuts.slice();
        const x = (e.clientX - rect.left) / rect.width;
        const prev = drag.index > 0 ? cuts[drag.index - 1] : 0;
        const after = drag.index < cuts.length - 1 ? cuts[drag.index + 1] : 1;
        cuts[drag.index] = Math.max(
          prev + minGap,
          Math.min(after - minGap, x)
        );
        next.verticalCuts = cuts;
      } else {
        const cuts = next.horizontalCuts.slice();
        const y = (e.clientY - rect.top) / rect.height;
        const prev = drag.index > 0 ? cuts[drag.index - 1] : 0;
        const after = drag.index < cuts.length - 1 ? cuts[drag.index + 1] : 1;
        cuts[drag.index] = Math.max(
          prev + minGap,
          Math.min(after - minGap, y)
        );
        next.horizontalCuts = cuts;
      }
      onChange(next);
    },
    [drag, minGap, onChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer was already released — fine.
      }
      setDrag(null);
    },
    [drag]
  );

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 select-none touch-none"
      // Catch pointer move/up at the root so a fast drag that briefly leaves
      // a thin handle doesn't drop tracking mid-gesture.
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Outline rectangle so the grid is clear even at 1x1 (no cuts). */}
      <div className="absolute inset-0 border-2 border-white/80 mix-blend-difference pointer-events-none" />

      {config.verticalCuts.map((frac, i) => (
        <CutLine
          key={`v-${i}`}
          axis="v"
          frac={frac}
          dragging={drag?.axis === "v" && drag.index === i}
          onPointerDown={handlePointerDown("v", i)}
        />
      ))}
      {config.horizontalCuts.map((frac, i) => (
        <CutLine
          key={`h-${i}`}
          axis="h"
          frac={frac}
          dragging={drag?.axis === "h" && drag.index === i}
          onPointerDown={handlePointerDown("h", i)}
        />
      ))}
    </div>
  );
}

interface CutLineProps {
  axis: "v" | "h";
  frac: number;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

function CutLine({ axis, frac, dragging, onPointerDown }: CutLineProps) {
  const percent = `${frac * 100}%`;
  const lineStyle: React.CSSProperties =
    axis === "v"
      ? { left: percent, top: 0, bottom: 0, width: 0 }
      : { top: percent, left: 0, right: 0, height: 0 };
  const hitStyle: React.CSSProperties =
    axis === "v"
      ? {
          left: `calc(${percent} - ${HANDLE_HIT_PX / 2}px)`,
          top: 0,
          bottom: 0,
          width: HANDLE_HIT_PX,
          cursor: "ew-resize",
        }
      : {
          top: `calc(${percent} - ${HANDLE_HIT_PX / 2}px)`,
          left: 0,
          right: 0,
          height: HANDLE_HIT_PX,
          cursor: "ns-resize",
        };
  return (
    <>
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          ...lineStyle,
          boxShadow: dragging
            ? "0 0 0 2px rgba(255, 255, 255, 0.95), 0 0 0 3px rgba(0, 0, 0, 0.4)"
            : "0 0 0 1px rgba(255, 255, 255, 0.95), 0 0 0 2px rgba(0, 0, 0, 0.35)",
        }}
      />
      <div
        role="separator"
        aria-orientation={axis === "v" ? "vertical" : "horizontal"}
        className="absolute"
        style={hitStyle}
        onPointerDown={onPointerDown}
      />
    </>
  );
}
