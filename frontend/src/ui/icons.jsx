// Small authored icon set: one 1.5px stroke, 24px grid, currentColor.

function Svg({ size = 16, children, className = "", ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

// Four-point compass star, the product mark.
export function StarMark({ size = 16, className }) {
  return (
    <Svg size={size} className={className}>
      <path d="M12 2.5 13.6 10.4 21.5 12 13.6 13.6 12 21.5 10.4 13.6 2.5 12 10.4 10.4Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function Reticle({ size = 16, className }) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </Svg>
  );
}

export function SearchIcon({ size = 16, className }) {
  return (
    <Svg size={size} className={className}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </Svg>
  );
}

export function CloseIcon({ size = 16, className }) {
  return (
    <Svg size={size} className={className}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  );
}

export function RetryIcon({ size = 16, className }) {
  return (
    <Svg size={size} className={className}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </Svg>
  );
}

export function ChevronDown({ size = 16, className }) {
  return (
    <Svg size={size} className={className}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}
