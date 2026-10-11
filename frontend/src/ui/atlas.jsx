// Shared atlas primitives: every tab is built from these so states,
// framing and vocabulary stay identical across the dashboard.
import { ChevronDown, Reticle, RetryIcon, StarMark } from "./icons";

export function PageHeading({ title, children }) {
  return (
    <header className="mb-8 max-w-3xl">
      <h1 className="display text-4xl sm:text-5xl leading-[1.05] text-star text-balance">{title}</h1>
      {children && <p className="mt-3 text-[15px] leading-relaxed text-mist text-pretty">{children}</p>}
    </header>
  );
}

// Registration cross drawn at plate corners, like the tick marks on a chart plate.
function Registration({ className }) {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true" className={`absolute text-rule ${className}`}>
      <path d="M4.5 0v9M0 4.5h9" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function Plate({ title, aside, children, className = "", bodyClassName = "p-5 sm:p-6", as: Tag = "section" }) {
  return (
    <Tag className={`relative border border-rule bg-plate/90 ${className}`}>
      <Registration className="-left-[5px] -top-[5px]" />
      <Registration className="-right-[5px] -top-[5px]" />
      <Registration className="-left-[5px] -bottom-[5px]" />
      <Registration className="-right-[5px] -bottom-[5px]" />
      {title && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 sm:px-6 pt-4">
          <h2 className="caps text-mist">{title}</h2>
          <span className="h-px min-w-6 flex-1 bg-rule" aria-hidden="true" />
          <span className="size-1 rounded-full bg-rule" aria-hidden="true" />
          {aside && <div className="text-xs text-fog">{aside}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

// A ruled key/value row, like an ephemeris table.
export function Reading({ label, value, note, emphasis = false }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-rule-soft py-2 last:border-b-0">
      <dt className="caps text-fog shrink-0">{label}</dt>
      <span className="flex-1 border-b border-dotted border-rule translate-y-[-3px]" aria-hidden="true" />
      <dd className={`text-right tabular-nums ${emphasis ? "text-emerald font-medium" : "text-star"}`}>
        {value}
        {note && <span className="ml-1.5 text-xs text-fog">{note}</span>}
      </dd>
    </div>
  );
}

export function Readings({ children, className = "" }) {
  return <dl className={`text-sm ${className}`}>{children}</dl>;
}

// ---- Shared states -------------------------------------------------------

export function LoadingState({ label = "Plotting" }) {
  return (
    <div role="status" className="flex min-h-56 flex-col items-center justify-center gap-4 text-fog">
      <Reticle size={28} className="text-emerald animate-[spin_6s_linear_infinite]" />
      <span className="caps">{label}…</span>
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <StarMark size={18} className="text-rule" />
      <p className="display text-2xl text-mist">{title}</p>
      {children && <p className="max-w-md text-sm leading-relaxed text-fog text-pretty">{children}</p>}
    </div>
  );
}

// API errors arrive as "503 Service Unavailable: {json}". Pull out the human part.
function readableError(message) {
  if (!message) return "Unknown error.";
  if (/Failed to fetch|NetworkError/i.test(message)) {
    return "The API isn't responding on port 8002. Check that the backend is running.";
  }
  const detail = message.match(/"detail"\s*:\s*"([^"]+)"/);
  return detail ? detail[1] : message;
}

export function ErrorState({ title = "Couldn't load this plate", error, onRetry }) {
  return (
    <div role="alert" className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="size-2 rounded-full bg-ember" aria-hidden="true" />
      <p className="display text-2xl text-star">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-mist">{readableError(error)}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          <RetryIcon size={14} /> Try again
        </Button>
      )}
    </div>
  );
}

// ---- Controls ------------------------------------------------------------

export function Button({ variant = "primary", className = "", children, ...rest }) {
  const base =
    "inline-flex items-center justify-center gap-2 h-10 px-5 text-sm font-medium tracking-wide transition-colors duration-150 disabled:cursor-not-allowed";
  const variants = {
    primary:
      "bg-emerald text-night hover:bg-emerald-glint active:bg-emerald-deep disabled:bg-raised disabled:text-fog",
    secondary: "border border-rule text-star hover:border-fog hover:bg-raised disabled:text-fog",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function FieldLabel({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="caps mb-2 block text-fog">
      {children}
    </label>
  );
}

// Segmented control: a row of options, one selected, emerald tick under the active one.
export function Segmented({ label, options, value, onChange, name }) {
  return (
    <fieldset>
      <legend className="caps mb-2 block text-fog">{label}</legend>
      <div className="flex flex-wrap border border-rule bg-night/60">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <label
              key={o.value}
              className={`relative flex-1 min-w-11 cursor-pointer select-none px-3 py-2 text-center text-sm transition-colors ${
                active ? "bg-raised text-star" : "text-fog hover:text-mist"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={active}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              {o.label}
              <span
                aria-hidden="true"
                className={`absolute inset-x-2 bottom-0 h-0.5 bg-emerald transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
              />
              <span className="pointer-events-none absolute inset-0 peer-focus-visible:outline peer-focus-visible:outline-[1.5px] peer-focus-visible:outline-emerald" />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Select({ id, label, value, onChange, options }) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-[38px] w-full appearance-none border border-rule bg-night/60 pl-3 pr-9 text-sm text-star hover:border-fog focus:border-emerald focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-plate">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fog" />
      </div>
    </div>
  );
}

// Magnitude legend: dot diameter = sample size, the atlas's core encoding.
export function MagnitudeLegend({ steps, radius, label = "Matches" }) {
  return (
    <div className="flex items-center gap-3 text-xs text-fog">
      <span className="caps">{label}</span>
      {steps.map((n) => {
        const r = radius(n);
        return (
          <span key={n} className="flex items-center gap-1.5 tabular-nums">
            <svg width={r * 2 + 2} height={r * 2 + 2} aria-hidden="true">
              <circle cx={r + 1} cy={r + 1} r={r} fill="var(--color-star)" opacity="0.85" />
            </svg>
            {n.toLocaleString()}
          </span>
        );
      })}
    </div>
  );
}

export function pct(v, digits = 1) {
  return `${(v * 100).toFixed(digits)}%`;
}
