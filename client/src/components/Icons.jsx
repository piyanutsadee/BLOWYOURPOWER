import { useId } from "react";

const LOBE = "M20 10C17 8 14.5 11 12 13.6 7.5 18.3 5 25.1 5 31.9c0 4.6 1.6 6.1 4.8 5.6 2.4-.4 5.7-2.5 8.9-3.4 3.1-.9 4-2 4.1-5.3.2-5.4-.4-14.6-2.8-18.8Z";

export function LungIcon({ colorful = false, className = "" }) {
  const id = useId();
  const fill = colorful ? `url(#${id}-lobe)` : "currentColor";
  const airway = colorful ? `url(#${id}-airway)` : "currentColor";
  return (
    <svg viewBox="0 0 48 44" className={className} aria-hidden="true">
      {colorful && (
        <defs>
          <linearGradient id={`${id}-lobe`} x1="0" y1="0" x2=".82" y2="1">
            <stop stopColor="#ffe8e6" />
            <stop offset=".38" stopColor="#ffaaa5" />
            <stop offset="1" stopColor="#ed797b" />
          </linearGradient>
          <linearGradient id={`${id}-airway`} x1="0" y1="0" x2="1" y2=".8">
            <stop stopColor="#8ec3df" />
            <stop offset="1" stopColor="#577da6" />
          </linearGradient>
        </defs>
      )}
      <path d="M24 4v17m0-6-8 8m8-8 8 8" fill="none" stroke={airway} strokeWidth="4.4" strokeLinecap="round" />
      <path d={LOBE} fill={fill} />
      <path d={LOBE} transform="translate(48 0) scale(-1 1)" fill={fill} />
    </svg>
  );
}

export function WaveIcon() {
  return (
    <svg className="wave-icon" viewBox="0 0 120 60" aria-hidden="true">
      <path d="M5 39h8c3.8 0 5.8-5 9.5-5 7 0 8.4 16 15.2 16C46 50 47.4 3 55 3s9.6 48 18.6 48c6.6 0 8.4-17 15.9-17 4.5 0 5.4 5 10.7 5H115" />
    </svg>
  );
}

export default function Icon({ name, className = "" }) {
  const common = { "aria-hidden": true, viewBox: "0 0 24 24", className, fill: "currentColor" };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M10.77 2.9a1.85 1.85 0 0 1 2.46 0l8.8 7.97c.82.74.3 2.1-.8 2.1h-1.3v7.25c0 .98-.8 1.78-1.78 1.78h-3.9v-5.45c0-.6-.48-1.08-1.08-1.08h-2.34c-.6 0-1.08.48-1.08 1.08V22h-3.9c-.98 0-1.78-.8-1.78-1.78v-7.25h-1.3c-1.1 0-1.62-1.36-.8-2.1Z" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M2 5.2c2.8-1.9 6.4-1.8 9 .1v15.1c-2.6-1.82-6.1-1.95-9-.42a1 1 0 0 1-1.47-.9V7.47C.53 6.6 1.08 5.83 2 5.2Zm20 0c-2.8-1.9-6.4-1.8-9 .1v15.1c2.6-1.82 6.1-1.95 9-.42a1 1 0 0 0 1.47-.9V7.47c0-.87-.55-1.64-1.47-2.27Z" />
          <path d="M4.8 8.3c1.3-.2 2.6.02 3.7.58M4.8 12c1.3-.17 2.6.04 3.7.6" fill="none" stroke="var(--icon-cutout, #1788c1)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "game":
      return (
        <svg {...common}>
          <path d="M7.1 4.5h9.8c3.08 0 4.62 2.2 5.38 5.4 1.03 4.32.96 8.37-1.45 9.54-1.78.86-3.35-1.07-4.55-2.67-.5-.69-1.27-1.03-2.16-1.03H9.88c-.89 0-1.66.34-2.17 1.03-1.19 1.6-2.76 3.53-4.54 2.67C.76 18.27.69 14.22 1.72 9.9 2.48 6.7 4.02 4.5 7.1 4.5Z" />
          <path d="M7.3 8.2v5m-2.5-2.5h5" stroke="var(--icon-cutout, #1788c1)" strokeWidth="1.65" strokeLinecap="round" />
          <circle cx="16" cy="10" r="1.35" fill="var(--icon-cutout, #1788c1)" />
          <circle cx="19" cy="12.5" r="1.25" fill="var(--icon-cutout, #1788c1)" />
        </svg>
      );
    case "gear":
      return (
        <svg {...common}>
          <path d="M9.8 1.4h4.4l.56 3.06c.6.23 1.16.56 1.68.94l2.93-1.02 2.23 3.87-2.36 2.08a8 8 0 0 1 0 1.96l2.36 2.08-2.23 3.87-2.93-1.02c-.52.38-1.08.7-1.68.94l-.56 3.06H9.8l-.56-3.06a8.14 8.14 0 0 1-1.68-.94l-2.93 1.02-2.23-3.87 2.36-2.08a8 8 0 0 1 0-1.96L2.4 8.25l2.23-3.87L7.56 5.4c.52-.38 1.08-.71 1.68-.94L9.8 1.4Zm2.2 6.48a3.43 3.43 0 1 0 0 6.87 3.43 3.43 0 0 0 0-6.87Z" fillRule="evenodd" />
        </svg>
      );
    case "mic":
      return (
        <svg {...common}>
          <rect x="8" y="2.05" width="8" height="12.2" rx="4" />
          <path d="M5.8 11.3v.96a6.2 6.2 0 0 0 12.4 0v-.96M12 19v2.2m-2.6.17h5.2" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
          <path className="mic-grille" d="M11 6.5h2m-2 1.75h2m-2 1.75h2" strokeWidth="1.05" strokeLinecap="round" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path d="M12 22s-9.7-4.84-10.42-11.2C1.05 6.16 4.18 3 7.27 3c2.33 0 3.62 1.33 4.73 2.99C13.11 4.33 14.4 3 16.73 3c3.09 0 6.22 3.16 5.69 7.8C21.7 17.16 12 22 12 22Z" />
          <path d="M12.4 14.3c-1.28-.4-2.14-1.39-1.91-2.43.21-.98 1.1-1.37 2.02-1.19.21-.94.89-1.46 1.7-1.2 1.09.36 1.36 1.57.84 2.67-.47 1.04-1.35 1.76-2.65 2.15Z" fill="#8dd3ed" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5.6 12.5 4.15 4.14 8.65-9.38" stroke="currentColor" strokeWidth="3.35" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "bronchi":
      return (
        <svg {...common}>
          <g fill="none" stroke="currentColor" strokeLinecap="round">
            <path d="M12 2.5v8.8m0-1C9.2 11.2 5 12.3 4.2 20.4m7.8-10.1c2.8.9 7 2 7.8 10.1" strokeWidth="3.4" />
            <path d="M7.3 14.25c1.9.94 2.22 2.67 1.82 5.5m7.58-5.5c-1.9.94-2.22 2.67-1.82 5.5m-9.46-3c1.5 1.65 1.5 3.39 1.3 4.76m12-4.77c-1.5 1.66-1.5 3.4-1.3 4.77M10.5 4.4h3m-3 2.6h3" strokeWidth="1.8" />
          </g>
        </svg>
      );
    case "alveoli":
      return (
        <svg {...common}>
          <path d="M12 2.8v6.4M12 8 7.1 12m4.9-4 4.9 4" stroke="currentColor" strokeWidth="3.05" strokeLinecap="round" fill="none" />
          <g stroke="currentColor" strokeWidth=".84" fill="var(--sac-fill, #abbed8)">
            <circle cx="6.8" cy="11.6" r="3" /><circle cx="4.8" cy="15.3" r="3.05" />
            <circle cx="7" cy="19.05" r="3.05" /><circle cx="9.2" cy="15.3" r="3.12" />
            <circle cx="17.2" cy="11.6" r="3" /><circle cx="19.2" cy="15.3" r="3.05" />
            <circle cx="17" cy="19.05" r="3.05" /><circle cx="14.8" cy="15.3" r="3.12" />
          </g>
        </svg>
      );
    case "medical":
      return (
        <svg {...common}>
          <path d="M9.2 2.5h5.6c.9 0 1.6.7 1.6 1.6v4.3h4.3c.9 0 1.6.7 1.6 1.6v5.6c0 .9-.7 1.6-1.6 1.6h-4.3v4.3c0 .9-.7 1.6-1.6 1.6H9.2c-.9 0-1.6-.7-1.6-1.6v-4.3H3.3c-.9 0-1.6-.7-1.6-1.6v-5.6c0-.9.7-1.6 1.6-1.6h4.3V4.1c0-.9.7-1.6 1.6-1.6Z" />
        </svg>
      );
    case "reset":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.4 11.6a7.7 7.7 0 1 1 2.1 5.72M4.4 6v5.6H10" />
        </svg>
      );
    default:
      return null;
  }
}
