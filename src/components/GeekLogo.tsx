import type { SVGProps } from 'react';

interface GeekLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

export function GeekLogo({ size = 44, className = '', ...props }: GeekLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="geekHexGrad" x1="12" y1="10" x2="108" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="55%" stopColor="#ff007f" />
          <stop offset="100%" stopColor="#fcee0a" />
        </linearGradient>
        <linearGradient id="geekBoltGrad" x1="40" y1="20" x2="84" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fcee0a" />
          <stop offset="50%" stopColor="#00f0ff" />
          <stop offset="100%" stopColor="#ff007f" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="108" height="108" rx="24" fill="#150f24" />
      <rect
        x="8"
        y="8"
        width="104"
        height="104"
        rx="22"
        stroke="url(#geekHexGrad)"
        strokeWidth="3"
        opacity="0.9"
      />
      <path
        d="M60 18L96 39V81L60 102L24 81V39L60 18Z"
        fill="#0b0714"
        stroke="#00f0ff"
        strokeWidth="2.5"
        strokeOpacity="0.6"
      />
      <path
        d="M67 27L42 63H59L52 93L79 56H62L67 27Z"
        fill="url(#geekBoltGrad)"
      />
    </svg>
  );
}
