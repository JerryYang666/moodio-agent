/**
 * Math + geometry helpers for the rotated-crop interaction.
 *
 * The crop tool lets the user rotate the IMAGE (any angle, not just 90°)
 * while the crop selection stays axis-aligned in screen space. Two things
 * fall out of that:
 *   1. The image's axis-aligned bounding box grows; the difference is
 *      transparent corners that the user can see through to whatever the
 *      crop tool is mounted over. We size a wrapper to this bounding box so
 *      both surfaces (chat modal + desktop overlay) measure the same area.
 *   2. The crop box must not drift into those transparent corners — its
 *      four corners need to all lie inside the rotated image rectangle.
 *      This is the constraint that previous rotation attempts got wrong:
 *      they only bounded the crop to the bbox, which still let it slip into
 *      the empty triangular regions outside the rotated image.
 *
 * Everything here is unit-free: ratios in, ratios out. The caller mixes in
 * the actual displayed pixel scale at render time.
 */

const RAD = Math.PI / 180;

/** Bounding-box dimensions of a (w × h) rectangle rotated by `deg`. */
export function rotatedBboxSize(
  w: number,
  h: number,
  deg: number
): { width: number; height: number } {
  const r = deg * RAD;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return {
    width: w * c + h * s,
    height: w * s + h * c,
  };
}

/**
 * Pixel-space rectangle (anything with x/y/width/height). Compatible with
 * `react-image-crop`'s `PixelCrop` plus our own internal candidates.
 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Test whether every corner of `crop` lies inside the rotated image. All
 * inputs share a single coordinate system: the wrapper's displayed pixel
 * space, with the image centered. Returns true for a zero-size crop (the
 * caller should treat that as "no crop yet" and ignore it).
 *
 * `tol` is a sub-pixel slack we allow around the boundary; without it,
 * floating-point drift can flag a crop the user dragged right against the
 * edge as out-of-bounds.
 */
export function isCropInsideRotatedImage(args: {
  crop: CropRect;
  containerW: number;
  containerH: number;
  imageDisplayedW: number;
  imageDisplayedH: number;
  rotationDeg: number;
  tol?: number;
}): boolean {
  const {
    crop,
    containerW,
    containerH,
    imageDisplayedW,
    imageDisplayedH,
    rotationDeg,
    tol = 0.5,
  } = args;
  if (crop.width <= 0 || crop.height <= 0) return true;

  const cx = containerW / 2;
  const cy = containerH / 2;
  // Inverse rotation: take a wrapper-space point and express it in the
  // image's own local frame (which is axis-aligned).
  const r = -rotationDeg * RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const halfW = imageDisplayedW / 2;
  const halfH = imageDisplayedH / 2;

  const corners: Array<[number, number]> = [
    [crop.x, crop.y],
    [crop.x + crop.width, crop.y],
    [crop.x, crop.y + crop.height],
    [crop.x + crop.width, crop.y + crop.height],
  ];
  for (const [px, py] of corners) {
    const dx = px - cx;
    const dy = py - cy;
    const lx = cos * dx - sin * dy;
    const ly = sin * dx + cos * dy;
    if (Math.abs(lx) > halfW + tol || Math.abs(ly) > halfH + tol) {
      return false;
    }
  }
  return true;
}

/**
 * Largest axis-aligned rectangle inscribed inside a (w × h) rectangle
 * rotated by `deg`, centered at the same origin. Used to pre-seed the
 * initial crop after a rotation so the user is never looking at a starting
 * rectangle that's already invalid against the new bounds.
 *
 * The closed-form solution is folklore (see e.g.
 * https://stackoverflow.com/a/16778797): for an angle θ in [0, π/2], with
 * inscribed aspect ratio matching the source w/h, the maximum inscribed
 * (w' × h') is given by
 *   w' = (w * cosθ - h * sinθ) / cos2θ  when |cos2θ| > 0
 *   h' = w' * h/w (same ratio)
 * and the special cases at 0° / 90° degenerate gracefully.
 *
 * For ANY axis-aligned rectangle (not constrained to source aspect), we
 * just take the half-diagonals. We use the source-aspect form because users
 * expect the auto-reset crop to look like the image's shape.
 */
export function maxInscribedAxisAlignedRect(
  w: number,
  h: number,
  deg: number
): { width: number; height: number } {
  // Normalize to first quadrant — the inscribed-rect problem is symmetric
  // across 90° rotations.
  const a = (((deg % 360) + 360) % 360) % 180;
  const t = (a > 90 ? 180 - a : a) * RAD;

  const sinT = Math.sin(t);
  const cosT = Math.cos(t);

  // Degenerate cases: no rotation, or perfect 90° turn. In both, the source
  // rectangle (or its 90° swap) fits exactly; the formula below blows up at
  // 45° when w === h so handle separately.
  if (sinT < 1e-6) return { width: w, height: h };
  if (cosT < 1e-6) return { width: h, height: w };

  const longSide = Math.max(w, h);
  const shortSide = Math.min(w, h);

  // The classical "inscribe a same-aspect rect in a rotated rect" formula.
  // Two regimes depending on whether the rotated short side dominates.
  if (shortSide <= 2 * sinT * cosT * longSide || Math.abs(sinT - cosT) < 1e-6) {
    const x = 0.5 * shortSide;
    const widerIsW = w >= h;
    const wPrime = widerIsW ? x / sinT : x / cosT;
    const hPrime = widerIsW ? x / cosT : x / sinT;
    return { width: wPrime, height: hPrime };
  }
  const cos2T = cosT * cosT - sinT * sinT;
  const wPrime = (w * cosT - h * sinT) / cos2T;
  const hPrime = (h * cosT - w * sinT) / cos2T;
  return { width: Math.abs(wPrime), height: Math.abs(hPrime) };
}
