"use client";

import React, { useEffect, useRef, useState } from "react";

const squirclePath = (w: number, h: number, r: number): string => {
  r = Math.min(r, w / 2, h / 2);
  const n = 5;
  const steps = 16;

  const pt = (t: number, cx: number, cy: number): string => {
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const x = cx + r * Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / n);
    const y = cy + r * Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / n);
    return `L${x.toFixed(3)},${y.toFixed(3)}`;
  };

  const arc = (cx: number, cy: number, startAngle: number): string => {
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = startAngle + (Math.PI / 2) * (i / steps);
      pts.push(pt(t, cx, cy));
    }
    return pts.join(" ");
  };

  return [
    `M${r},0`,
    `L${w - r},0`,
    arc(w - r, r, -Math.PI / 2),
    `L${w},${h - r}`,
    arc(w - r, h - r, 0),
    `L${r},${h}`,
    arc(r, h - r, Math.PI / 2),
    `L0,${r}`,
    arc(r, r, Math.PI),
    "Z",
  ].join(" ");
};

const maskCache = new Map<string, string>();

function buildSquircleMask(w: number, h: number, radius: number): string {
  const key = `${w}_${h}_${radius}`;
  let mask = maskCache.get(key);
  if (mask) return mask;

  const path = squirclePath(w, h, radius);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'><path d='${path}' fill='black'/></svg>`;
  mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  maskCache.set(key, mask);
  return mask;
}

export const SQUIRCLE_RADIUS_PX = 20;

export interface SquircleProps {
  /** Corner radius in pixels. Defaults to SQUIRCLE_RADIUS_PX (20). */
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  /** data-* or other HTML attributes */
  [key: `data-${string}`]: string | undefined;
}

export const Squircle = React.forwardRef<HTMLDivElement, SquircleProps>(
  ({ radius = SQUIRCLE_RADIUS_PX, className, style, children, ...rest }, forwardedRef) => {
    const innerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);

    const ref = (forwardedRef as React.RefObject<HTMLDivElement>) ?? innerRef;

    useEffect(() => {
      const el = (ref as React.RefObject<HTMLDivElement>).current;
      if (!el) return;

      const ro = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect && rect.width > 0 && rect.height > 0) {
          setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [ref]);

    const maskStyle: React.CSSProperties = {};
    if (size) {
      const mask = buildSquircleMask(size.w, size.h, radius);
      maskStyle.WebkitMaskImage = mask;
      maskStyle.maskImage = mask;
      maskStyle.WebkitMaskSize = "100% 100%";
      maskStyle.maskSize = "100% 100%";
    }

    return (
      <div
        ref={ref}
        className={className}
        style={{ ...maskStyle, ...style }}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

Squircle.displayName = "Squircle";
