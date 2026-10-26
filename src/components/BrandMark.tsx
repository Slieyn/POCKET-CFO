"use client";

import { useId } from "react";

/**
 * Inline POCKET CFO badge mark: indigo frame, framing chevrons and a two-leaf
 * sprout. The frame, chevrons and leaves can draw themselves in sequence for
 * the loading experience. Everything is inline SVG so it stays crisp and needs
 * no extra network request.
 */
export function BrandMark({
  size = 64,
  animated = false,
  className = "",
  title,
}: {
  size?: number;
  animated?: boolean;
  className?: string;
  title?: string;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const backgroundId = `pcfo-bg-${uid}`;
  const frameId = `pcfo-frame-${uid}`;
  const clipId = `pcfo-clip-${uid}`;

  return (
    <svg
      className={`brand-mark${animated ? " is-animated" : ""}${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={backgroundId} x1="4" y1="0" x2="60" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0d1722" />
          <stop offset="1" stopColor="#05090e" />
        </linearGradient>
        <linearGradient id={frameId} x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c8cff" />
          <stop offset="0.55" stopColor="#4c63f0" />
          <stop offset="1" stopColor="#2b39b8" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect width="64" height="64" rx="15" />
        </clipPath>
      </defs>

      <rect width="64" height="64" rx="15" fill={`url(#${backgroundId})`} />

      <g clipPath={`url(#${clipId})`} aria-hidden="true">
        <g className="bm-glint">
          <rect x="-26" y="-18" width="10" height="104" rx="5" fill="#ffffff" opacity="0.1" transform="rotate(22 32 32)" />
        </g>
      </g>

      <rect
        className="bm-frame"
        x="3.6"
        y="3.6"
        width="56.8"
        height="56.8"
        rx="10"
        stroke={`url(#${frameId})`}
        strokeWidth="1.5"
        pathLength={1}
      />
      <path
        className="bm-chevron bm-chevron-top"
        d="M9.8 18.7 32 9.3l22.2 9.4"
        stroke="#ffffff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
      />
      <path
        className="bm-chevron bm-chevron-bottom"
        d="M9.8 45.3 32 54.7l22.2-9.4"
        stroke="#ffffff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
      />

      <g fill="none" stroke="#ffffff" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
        <path
          className="bm-leaf bm-leaf-left"
          d="M31.9 41.7c-6.9-.4-12.5-5.3-13.7-12.5 7.1.1 12.6 5.3 13.7 12.5Z"
          pathLength={1}
        />
        <path
          className="bm-leaf bm-leaf-right"
          d="M32.1 41.7c6.9-.4 12.5-5.3 13.7-12.5-7.1.1-12.6 5.3-13.7 12.5Z"
          pathLength={1}
        />
        <path className="bm-stem" d="M32 41.7v-6.3" pathLength={1} />
        <path className="bm-vein" d="M31.4 38.4c-2.7-2.1-5.2-4.8-7-7.7" pathLength={1} />
        <path className="bm-vein" d="M32.6 38.4c2.7-2.1 5.2-4.8 7-7.7" pathLength={1} />
      </g>
    </svg>
  );
}
