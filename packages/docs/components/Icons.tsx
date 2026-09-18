/**
 * Hand-rolled icons.
 *
 * The docs site deliberately has no icon library: the published packages are
 * the product and the site is scaffolding, so its dependency list stays at
 * next/react. A dozen 24px glyphs are cheaper than a dependency.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

/**
 * The 16px default is a width/height attribute rather than a class, so a
 * caller that passes `className` for something else (a transition, say) 
 * still gets a sized icon instead of a collapsed one. A className carrying
 * `h-*`/`w-*` overrides it, since CSS beats presentation attributes.
 */
function Icon({ children, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none ${className ?? ''}`}
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const ArrowUpRight = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Icon>
);

export const Copy = (props: IconProps) => (
  <Icon {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a1 1 0 0 1 1-1h9" />
  </Icon>
);

export const Check = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 13 4 4L19 7" />
  </Icon>
);

export const Menu = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const Close = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const Search = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

/** The mark: an aperture. Six blades, drawn as one path. */
export const Aperture = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.2 4.2 5 8.66M3.5 13.1l10-.1M7.3 20.4l5-8.66M15.8 19.8l-5-8.66M20.5 10.9l-10 .1M16.7 3.6l-5 8.66" />
  </Icon>
);

export const Package = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3 4 7v10l8 4 8-4V7l-8-4ZM4 7l8 4 8-4M12 11v10" />
  </Icon>
);

export const Layers = (props: IconProps) => (
  <Icon {...props}>
    <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5" />
  </Icon>
);

export const Database = (props: IconProps) => (
  <Icon {...props}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
  </Icon>
);

export const Shield = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3 5 6v5.5c0 4.2 2.9 8.1 7 9.5 4.1-1.4 7-5.3 7-9.5V6l-7-3Z" />
  </Icon>
);

export const Upload = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
);

export const GitHub = ({ className, ...props }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
    fill="currentColor"
    aria-hidden="true"
    className={`flex-none ${className ?? ''}`}
    {...props}
  >
    <path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2.2c-3.34.72-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.77-1.34-1.77-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.8 1.3 3.49 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.13-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.23 0 4.63-2.8 5.65-5.48 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" />
  </svg>
);
