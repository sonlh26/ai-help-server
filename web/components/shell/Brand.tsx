"use client";

/** Diamond brand mark in AI green, with subtle glow. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="drop-shadow-[0_0_10px_rgba(33,208,122,0.45)]"
      >
        <defs>
          <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3ce69a" />
            <stop offset="100%" stopColor="#19b86b" />
          </linearGradient>
        </defs>
        <path
          d="M12 2.5 21.5 12 12 21.5 2.5 12 12 2.5Z"
          fill="url(#brand-g)"
        />
        <path
          d="M12 7.5 16.5 12 12 16.5 7.5 12 12 7.5Z"
          fill="#07140d"
          opacity="0.55"
        />
      </svg>
    </span>
  );
}

/** Full brand lockup: diamond + "AI Help". */
export function BrandLockup() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark size={30} />
      <span className="text-[15px] font-semibold tracking-tight leading-none">
        <span className="text-[var(--color-accent)]">AI</span> Help
      </span>
    </div>
  );
}
