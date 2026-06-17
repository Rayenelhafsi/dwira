import { ReactNode, useId } from "react";

interface LightningBorderProps {
  children: ReactNode;
  enabled?: boolean;
  className?: string;
}

export default function LightningBorder({
  children,
  enabled = true,
  className = "",
}: LightningBorderProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  if (!enabled) return <>{children}</>;

  return (
    <div className={`relative ${className}`} style={{ isolation: "isolate" }}>
      <svg
        aria-hidden="true"
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      >
        <defs>
          <filter
            id={`ffire-${uid}`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.018 0.055"
              numOctaves="4"
              result="noise"
              seed="12"
            >
              <animate
                attributeName="baseFrequency"
                dur="1.8s"
                values="0.018 0.055;0.022 0.065;0.015 0.048;0.020 0.058;0.018 0.055"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="4"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div
        aria-hidden="true"
        className={`fire-outer-${uid}`}
        style={{
          position: "absolute",
          inset: "-10px",
          borderRadius: "inherit",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "-8px",
          borderRadius: "inherit",
          zIndex: 1,
          pointerEvents: "none",
          filter: `url(#ffire-${uid})`,
          overflow: "visible",
        }}
      >
        <div className={`fire-a-${uid}`} />
        <div className={`fire-b-${uid}`} />
      </div>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "-4px",
          borderRadius: "inherit",
          zIndex: 2,
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        <div className={`fire-core-${uid}`} />
      </div>

      <div style={{ position: "relative", zIndex: 3 }}>{children}</div>

      <style>{`
        @property --ang-a-${uid} { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
        @property --ang-b-${uid} { syntax: '<angle>'; inherits: false; initial-value: 200deg; }
        @property --ang-c-${uid} { syntax: '<angle>'; inherits: false; initial-value: 320deg; }

        @keyframes spin-a-${uid} { to { --ang-a-${uid}: 360deg; } }
        @keyframes spin-b-${uid} { to { --ang-b-${uid}: 560deg; } }
        @keyframes spin-c-${uid} { to { --ang-c-${uid}: 680deg; } }

        @keyframes flicker-${uid} {
          0% { opacity: 0.88; }
          20% { opacity: 1; }
          45% { opacity: 0.82; }
          60% { opacity: 0.96; }
          80% { opacity: 0.75; }
          100% { opacity: 0.88; }
        }

        @keyframes glow-${uid} {
          0%, 100% {
            box-shadow:
              0 0 8px 4px rgba(255, 90, 10, 0.26),
              0 0 18px 8px rgba(255, 55, 0, 0.12),
              0 0 36px 16px rgba(180, 25, 0, 0.06);
          }
          40% {
            box-shadow:
              0 0 12px 6px rgba(255, 130, 20, 0.38),
              0 0 28px 12px rgba(255, 75, 5, 0.18),
              0 0 52px 20px rgba(200, 35, 0, 0.1);
          }
          70% {
            box-shadow:
              0 0 6px 3px rgba(255, 70, 0, 0.22),
              0 0 14px 6px rgba(220, 40, 0, 0.12),
              0 0 28px 10px rgba(150, 20, 0, 0.05);
          }
        }

        .fire-outer-${uid} {
          animation: glow-${uid} 2.4s ease-in-out infinite;
        }

        .fire-a-${uid} {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 4px;
          background: conic-gradient(
            from var(--ang-a-${uid}),
            transparent 0%,
            rgba(200,40,0,0.28) 4%,
            #cc2200 9%,
            #e03500 14%,
            #ff5500 19%,
            #ff7d00 25%,
            #ffaa00 30%,
            #ffd060 34%,
            #fff3a0 37%,
            #ffd060 40%,
            #ffaa00 44%,
            #ff7d00 49%,
            #ff5500 53%,
            #cc2a00 57%,
            rgba(200,40,0,0.28) 62%,
            transparent 66%,
            transparent 100%
          );
          animation: spin-a-${uid} 5s linear infinite, flicker-${uid} 2.2s ease-in-out infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          filter: blur(1.8px);
        }

        .fire-b-${uid} {
          position: absolute;
          inset: 2px;
          border-radius: inherit;
          padding: 3px;
          background: conic-gradient(
            from var(--ang-b-${uid}),
            transparent 0%,
            transparent 32%,
            rgba(204,34,0,0.18) 35%,
            #cc2200 39%,
            #ff6200 44%,
            #ffaa00 49%,
            #ffe880 52%,
            #ffaa00 55%,
            #ff6200 60%,
            #cc2200 64%,
            rgba(204,34,0,0.18) 67%,
            transparent 70%,
            transparent 100%
          );
          animation: spin-b-${uid} 3.8s linear infinite, flicker-${uid} 1.7s ease-in-out infinite 0.6s;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          filter: blur(0.9px);
          opacity: 0.82;
        }

        .fire-core-${uid} {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.75px;
          background: conic-gradient(
            from var(--ang-c-${uid}),
            transparent 0%,
            transparent 64%,
            rgba(255,68,0,0.2) 66%,
            #ff5500 69%,
            #ff8800 72%,
            #ffcc00 73.5%,
            #fff9d0 74.5%,
            #ffcc00 75.5%,
            #ff8800 77%,
            #ff5500 79%,
            rgba(255,68,0,0.2) 81%,
            transparent 83%,
            transparent 100%
          );
          animation: spin-c-${uid} 2.8s linear infinite, flicker-${uid} 0.85s ease-in-out infinite 0.2s;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }

        @media (max-width: 767px) {
          .fire-outer-${uid} { inset: -6px !important; }
          .fire-a-${uid} { padding: 3px; filter: blur(1.3px); }
          .fire-b-${uid} { padding: 2px; filter: blur(0.7px); }
          .fire-core-${uid} { padding: 1.4px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .fire-outer-${uid},
          .fire-a-${uid},
          .fire-b-${uid},
          .fire-core-${uid} {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
