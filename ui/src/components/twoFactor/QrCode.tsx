import { encode } from 'uqr';

/**
 * A QR code drawn as one SVG path, for an authenticator app to scan.
 *
 * Encoded here rather than fetched as an image: the address carries the
 * account's secret, and it must not leave the page.
 */
export function QrCode({ value, size = 192, label }: { value: string; size?: number; label: string }) {
  const { data, size: modules } = encode(value, { ecc: 'M', border: 2 });
  let path = '';
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    });
  });
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      style={{ background: 'white', borderRadius: 8 }}
    >
      <path d={path} fill="black" />
    </svg>
  );
}
