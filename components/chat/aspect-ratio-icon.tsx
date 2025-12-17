import React from "react";
import clsx from "clsx";

interface AspectRatioIconProps {
  ratio: string;
  size?: number;
  className?: string;
}

export function AspectRatioIcon({
  ratio,
  size = 20,
  className,
}: AspectRatioIconProps) {
  const [w, h] = ratio.split(":").map(Number);

  if (isNaN(w) || isNaN(h)) return null;

  // Calculate dimensions to fit within size x size box
  // maximizing the dimension that is larger
  let width, height;

  if (w > h) {
    width = size;
    height = (h / w) * size;
  } else {
    height = size;
    width = (w / h) * size;
  }

  // Ensure dimensions are at least a few pixels for visibility
  width = Math.max(width, 4);
  height = Math.max(height, 4);

  return (
    <div
      className={clsx("flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <div
        className="border-2 border-current rounded-[2px]"
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      />
    </div>
  );
}
