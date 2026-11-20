import { useId, useState, type HTMLAttributes } from 'react';

export const GEEK_LOGO_SRC =
  './assets/aistudio/WiP45eXOWi_QBpD7zXe83QyBCQ5yQGXbUUa-efCNqGBQIx_u3L8-lDvUsWZi3Xzn_RZqPWLXo5RURXT4mC2G_DpD_cc38201b.jpg';

interface GeekLogoProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  alt?: string;
  decorative?: boolean;
}

export function GeekLogo({
  size = 44,
  alt = 'Логотип Geek',
  decorative = false,
  className = '',
  style,
  ...props
}: GeekLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const uid = useId().replace(/:/g, '');
  const boltGradId = `geekBoltGrad-${uid}`;
  const bgGradId = `geekBgGrad-${uid}`;

  const hasExplicitSizeClass = /\b(?:w-|h-)/.test(className);
  const mergedStyle = hasExplicitSizeClass
    ? style
    : { width: size, height: size, ...style };

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-[20%] bg-[#0b0714] select-none shrink-0 ${className}`}
      style={mergedStyle}
      aria-hidden={decorative ? 'true' : undefined}
      {...props}
    >
      {!imgFailed ? (
        <img
          src={GEEK_LOGO_SRC}
          alt={decorative ? '' : alt}
          draggable={false}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover scale-[1.07] block pointer-events-none"
        />
      ) : (
        <svg
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full block"
          role={decorative ? undefined : 'img'}
          aria-label={decorative ? undefined : alt}
          aria-hidden={decorative ? 'true' : undefined}
        >
          <defs>
            <linearGradient id={bgGradId} x1="60" y1="0" x2="60" y2="120" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#120424" />
              <stop offset="68%" stopColor="#0b0317" />
              <stop offset="100%" stopColor="#350838" />
            </linearGradient>
            <linearGradient id={boltGradId} x1="62" y1="12" x2="54" y2="108" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fcee0a" />
              <stop offset="48%" stopColor="#ff2ea6" />
              <stop offset="100%" stopColor="#00f0ff" />
            </linearGradient>
          </defs>
          <rect width="120" height="120" rx="24" fill={`url(#${bgGradId})`} />
          <path d="M0 78H120M0 90H120M0 103H120" stroke="#ff0088" strokeOpacity="0.35" strokeWidth="1" />
          <path d="M60 78V120M35 78L10 120M85 78L110 120" stroke="#ff0088" strokeOpacity="0.35" strokeWidth="1" />
          <path
            d="M10 24V10H24M96 10H110V24M10 96V110H24M96 110H110V96"
            stroke="#00f0ff"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="28" y="35" width="32" height="3" fill="#00f0ff" />
          <rect x="61" y="77" width="28" height="3" fill="#ff0099" />
          <rect x="24" y="92" width="21" height="2.5" fill="#d9b44a" />
          <path
            d="M71 12L36 63H56L47 109L85 52H64L71 12Z"
            fill={`url(#${boltGradId})`}
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
