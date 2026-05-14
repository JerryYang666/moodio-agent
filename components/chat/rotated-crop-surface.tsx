"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactCrop, { type Crop as ReactCropArea, type PixelCrop } from "react-image-crop";

import {
  isCropInsideRotatedImage,
  rotatedBboxSize,
} from "@/lib/image/crop-rotation";

interface RotatedCropSurfaceProps {
  src: string;
  /** Total rotation in degrees applied to the IMAGE; crop stays axis-aligned. */
  rotationDeg: number;
  flipX: boolean;
  flipY: boolean;
  /** Aspect-ratio constraint forwarded to ReactCrop. `undefined` = free. */
  aspect: number | undefined;
  crop: ReactCropArea | undefined;
  onCropChange: (next: ReactCropArea) => void;
  onCropComplete: (next: PixelCrop) => void;
  imageRef: React.RefObject<HTMLImageElement | null>;
  cropContainerRef: React.RefObject<HTMLElement | null>;
  onImageLoad?: () => void;
  /**
   * Layout host:
   *   - "modal":  inline within a flex column; envelope fits `min(parent.width, 72vh)`.
   *   - "overlay": absolute over a fixed asset rect; envelope fills it.
   */
  layout: "modal" | "overlay";
}

const MODAL_MAX_VH = 72;

/**
 * Crop surface that supports rotating the IMAGE while keeping the crop box
 * axis-aligned. The image rotates around its own center; an outer wrapper
 * sized to the rotated bounding box prevents the empty corners from
 * exposing whatever sits below, and crop changes are rejected when any
 * corner of the candidate selection escapes the rotated image rectangle.
 *
 * The "rejection" behavior is what previous rotation attempts missed:
 * bounding the crop to the rotated bbox isn't enough because the bbox
 * includes four transparent triangles around the rotated image. We
 * additionally validate against the rotated quadrilateral.
 */
export default function RotatedCropSurface({
  src,
  rotationDeg,
  flipX,
  flipY,
  aspect,
  crop,
  onCropChange,
  onCropComplete,
  imageRef,
  cropContainerRef,
  onImageLoad,
  layout,
}: RotatedCropSurfaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const envelopeRef = useRef<HTMLDivElement | null>(null);

  // Re-measure on PARENT resize (window resize, modal column flips, canvas
  // pan/zoom). We observe the parent rather than the host because the host
  // wraps to the envelope's pixel dims — observing it would give us the
  // envelope size back and produce a feedback loop.
  const [hostSize, setHostSize] = useState<{ w: number; h: number } | null>(
    null
  );

  useLayoutEffect(() => {
    // Climb to the nearest ancestor with a definite, block-level size. The
    // immediate parent may be inline / inline-flex (size-to-children), which
    // would feed back into our envelope size and stick at 1×1.
    let cur: HTMLElement | null = hostRef.current?.parentElement ?? null;
    let target: HTMLElement | null = null;
    while (cur) {
      const cs = window.getComputedStyle(cur);
      const isInlineish =
        cs.display === "inline" ||
        cs.display === "inline-block" ||
        cs.display === "inline-flex";
      const rect = cur.getBoundingClientRect();
      if (!isInlineish && rect.width > 50) {
        target = cur;
        break;
      }
      cur = cur.parentElement;
    }
    target = target ?? hostRef.current?.parentElement ?? null;
    if (!target) return;
    const measure = () => {
      const rect = target!.getBoundingClientRect();
      setHostSize({ w: rect.width, h: rect.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(target);
    return () => ro.disconnect();
  }, []);

  // Force a re-render once the source image has decoded so we know natural dims.
  const [, forceTick] = useState(0);
  const onLoadImpl = useCallback(() => {
    forceTick((v) => v + 1);
    onImageLoad?.();
  }, [onImageLoad]);

  const natural = imageRef.current
    ? { w: imageRef.current.naturalWidth, h: imageRef.current.naturalHeight }
    : null;

  // Compute the envelope size in CSS pixels. Done in JS so we can honor the
  // host's actual width AND height (CSS aspect-ratio alone doesn't combine
  // cleanly with both maxWidth and maxHeight constraints when the parent
  // doesn't have a fixed size).
  const sizing = useMemo(() => {
    if (!natural || !hostSize) return null;
    const { w: nw, h: nh } = natural;
    if (!nw || !nh) return null;
    const bbox = rotatedBboxSize(nw, nh, rotationDeg);
    // Available area depends on the host. For the modal we cap at 72vh in
    // CSS pixels (computed once layout knows the viewport); for the overlay
    // we use the host's actual dims (asset rect).
    let availW = hostSize.w;
    let availH =
      layout === "modal"
        ? Math.min(
            hostSize.h > 0 ? hostSize.h : Number.POSITIVE_INFINITY,
            typeof window === "undefined"
              ? Number.POSITIVE_INFINITY
              : (window.innerHeight * MODAL_MAX_VH) / 100
          )
        : hostSize.h;
    // Modal's host may not have a determinate height (inline-flex parent);
    // in that case fall back to the 72vh cap alone.
    if (!Number.isFinite(availH) || availH <= 0) {
      availH =
        typeof window === "undefined"
          ? 600
          : (window.innerHeight * MODAL_MAX_VH) / 100;
    }
    if (!availW || availW <= 0) availW = 1;
    const scale = Math.min(availW / bbox.width, availH / bbox.height);
    const envW = bbox.width * scale;
    const envH = bbox.height * scale;
    const imgW = nw * scale;
    const imgH = nh * scale;
    return {
      envW,
      envH,
      imgW,
      imgH,
      imgFracW: nw / bbox.width,
      imgFracH: nh / bbox.height,
    };
  }, [natural, hostSize, rotationDeg, layout]);

  // Last accepted crop — replayed when we reject an invalid candidate so the
  // controlled prop stays stable.
  const lastValidCropRef = useRef<ReactCropArea | undefined>(crop);
  useEffect(() => {
    lastValidCropRef.current = crop;
  }, [crop]);

  const setEnvelopeNode = useCallback(
    (node: HTMLDivElement | null) => {
      envelopeRef.current = node;
      cropContainerRef.current = node;
    },
    [cropContainerRef]
  );

  const validateAndForward = useCallback(
    (next: ReactCropArea, kind: "change" | "complete") => {
      const env = envelopeRef.current;
      if (!env || !sizing || !next || next.width === 0 || next.height === 0) {
        if (kind === "change") onCropChange(next);
        else onCropComplete(next as PixelCrop);
        if (kind === "change") lastValidCropRef.current = next;
        return;
      }
      const containerW = sizing.envW;
      const containerH = sizing.envH;
      const imageDisplayedW = sizing.imgW;
      const imageDisplayedH = sizing.imgH;
      const pixelCrop =
        next.unit === "%"
          ? {
              x: (next.x / 100) * containerW,
              y: (next.y / 100) * containerH,
              width: (next.width / 100) * containerW,
              height: (next.height / 100) * containerH,
            }
          : { x: next.x, y: next.y, width: next.width, height: next.height };
      const ok = isCropInsideRotatedImage({
        crop: pixelCrop,
        containerW,
        containerH,
        imageDisplayedW,
        imageDisplayedH,
        rotationDeg,
      });
      if (!ok) {
        if (kind === "change" && lastValidCropRef.current) {
          onCropChange(lastValidCropRef.current);
        }
        return;
      }
      if (kind === "change") {
        lastValidCropRef.current = next;
        onCropChange(next);
      } else {
        onCropComplete(next as PixelCrop);
      }
    },
    [sizing, rotationDeg, onCropChange, onCropComplete]
  );

  const handleChange = useCallback(
    (next: ReactCropArea) => validateAndForward(next, "change"),
    [validateAndForward]
  );
  const handleComplete = useCallback(
    (next: PixelCrop) => validateAndForward(next, "complete"),
    [validateAndForward]
  );

  const hostStyle: React.CSSProperties =
    layout === "overlay"
      ? {
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }
      : {
          // Host wraps to the envelope's pixel dims; parent ResizeObserver
          // tells us how much space we have to grow into.
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        };

  const envelopeStyle: React.CSSProperties = sizing
    ? { width: sizing.envW, height: sizing.envH }
    : { width: 1, height: 1, visibility: "hidden" };

  // Inner <img> sits at envelope center, sized to the unrotated image at the
  // current display scale, then rotated/flipped via transform.
  const innerImgStyle: React.CSSProperties = sizing
    ? {
        position: "absolute",
        top: "50%",
        left: "50%",
        width: sizing.imgW,
        height: sizing.imgH,
        marginLeft: -sizing.imgW / 2,
        marginTop: -sizing.imgH / 2,
        transform: `rotate(${rotationDeg}deg) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
        transformOrigin: "center",
        userSelect: "none",
        pointerEvents: "none",
      }
    : { display: "none" };

  return (
    <div ref={hostRef} style={hostStyle}>
      <ReactCrop
        crop={crop}
        onChange={handleChange}
        onComplete={handleComplete}
        aspect={aspect}
        ruleOfThirds={false}
      >
        <div
          ref={setEnvelopeNode}
          style={{
            ...envelopeStyle,
            position: "relative",
            overflow: "hidden",
            background: "rgba(0, 0, 0, 0.05)",
          }}
        >
          <img
            ref={imageRef}
            src={src}
            alt=""
            style={innerImgStyle}
            onLoad={onLoadImpl}
            draggable={false}
          />
        </div>
      </ReactCrop>
    </div>
  );
}
