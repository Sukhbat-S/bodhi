import { forwardRef } from "react";

/**
 * Gesture visual indicators overlay — positioned over the 3D canvas.
 * Visibility driven entirely by CSS [data-gesture] selectors.
 * GestureController writes data-gesture/data-dir from useFrame() (zero re-renders).
 */
const GestureIndicatorOverlay = forwardRef<HTMLDivElement>((_props, ref) => (
  <div
    ref={ref}
    className="gesture-overlay absolute inset-0 pointer-events-none z-10 overflow-hidden"
    data-gesture=""
    data-dir=""
  >
    {/* Rotate: curved arrow at center */}
    <svg
      className="g-indicator g-rotate absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      width="80" height="80" viewBox="0 0 80 80" fill="none"
    >
      <path
        d="M55 20 A25 25 0 0 1 55 60"
        stroke="rgba(245, 158, 11, 0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <polygon points="55,16 60,24 50,24" fill="rgba(245, 158, 11, 0.6)" />
    </svg>

    {/* Zoom in: expanding rings */}
    <div className="g-indicator g-zoom-in absolute top-1/2 left-1/2">
      <div
        className="g-zoom-ring absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-400/50"
        style={{ width: 60, height: 60, left: 0, top: 0 }}
      />
      <div
        className="g-zoom-ring absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/30"
        style={{ width: 90, height: 90, left: 0, top: 0 }}
      />
      <span className="absolute -translate-x-1/2 -translate-y-1/2 text-blue-400/60 text-xl font-light" style={{ left: 0, top: 0 }}>+</span>
    </div>

    {/* Zoom out: contracting rings */}
    <div className="g-indicator g-zoom-out absolute top-1/2 left-1/2">
      <div
        className="g-zoom-ring absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-400/50"
        style={{ width: 60, height: 60, left: 0, top: 0 }}
      />
      <div
        className="g-zoom-ring absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/30"
        style={{ width: 90, height: 90, left: 0, top: 0 }}
      />
      <span className="absolute -translate-x-1/2 -translate-y-1/2 text-blue-400/60 text-xl font-light" style={{ left: 0, top: 0 }}>&minus;</span>
    </div>

    {/* Pan: straight arrow at center */}
    <svg
      className="g-indicator g-pan absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      width="60" height="60" viewBox="0 0 60 60" fill="none"
    >
      <line x1="10" y1="30" x2="50" y2="30" stroke="rgba(249, 115, 22, 0.5)" strokeWidth="2" strokeLinecap="round" />
      <polygon points="50,26 56,30 50,34" fill="rgba(249, 115, 22, 0.5)" />
    </svg>

    {/* Confirm: green checkmark flash */}
    <svg
      className="g-indicator g-confirm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      width="60" height="60" viewBox="0 0 60 60" fill="none"
    >
      <circle cx="30" cy="30" r="25" stroke="rgba(52, 211, 153, 0.4)" strokeWidth="2" fill="rgba(52, 211, 153, 0.08)" />
      <polyline points="18,30 26,38 42,22" stroke="rgba(52, 211, 153, 0.7)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>

    {/* Reset: radial ripple */}
    <div
      className="g-indicator g-reset absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-violet-400/40"
      style={{ width: 80, height: 80 }}
    />
  </div>
));

GestureIndicatorOverlay.displayName = "GestureIndicatorOverlay";

export { GestureIndicatorOverlay };
