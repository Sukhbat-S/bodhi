import { useEffect, useRef, useState, useCallback } from "react";
import type { Landmark, GestureType, HandState } from "../hooks/useHandGesture";

// MediaPipe hand connections for skeleton drawing
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const GESTURE_ICONS: Record<GestureType, string> = {
  none: "?",
  palm: "\u270B",
  point: "\u261D\uFE0F",
  pinch: "\uD83E\uDD0F",
  fist: "\u270A",
  thumbsup: "\uD83D\uDC4D",
  wave: "\uD83D\uDC4B",
};

interface HandOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  landmarks: Landmark[];
  gesture: GestureType;
  isActive: boolean;
  hands?: HandState[];
  pinchDistance?: number;
  palmPosition?: { x: number; y: number };
}

function getDetailedLabel(gesture: GestureType, pinchDistance?: number, palmPosition?: { x: number; y: number }, handCount?: number): string {
  const twoHand = handCount && handCount >= 2;
  switch (gesture) {
    case "palm": {
      if (twoHand) return "Expand (2H)";
      if (!palmPosition) return "Rotate";
      const dx = palmPosition.x - 0.5;
      const dy = palmPosition.y - 0.5;
      const dir = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0.05 ? "Right" : dx < -0.05 ? "Left" : "")
        : (dy > 0.05 ? "Down" : dy < -0.05 ? "Up" : "");
      return dir ? `Rotate ${dir}` : "Rotate";
    }
    case "pinch": {
      if (twoHand) {
        return pinchDistance !== undefined && pinchDistance < 0.04 ? "Zoom In (2H)" : "Zoom Out (2H)";
      }
      if (pinchDistance === undefined) return "Zoom";
      return pinchDistance < 0.04 ? "Zoom In" : pinchDistance > 0.08 ? "Zoom Out" : "Zoom";
    }
    case "fist": {
      if (twoHand) return "Free Rotate (2H)";
      if (!palmPosition) return "Pan";
      const dx = palmPosition.x - 0.5;
      const dy = palmPosition.y - 0.5;
      return Math.abs(dx) > Math.abs(dy)
        ? (dx > 0.05 ? "Pan Right" : dx < -0.05 ? "Pan Left" : "Pan")
        : (dy > 0.05 ? "Pan Down" : dy < -0.05 ? "Pan Up" : "Pan");
    }
    case "point": return "Selecting...";
    case "thumbsup": return "Confirmed!";
    case "wave": return "Resetting...";
    case "none": return "Show hand";
  }
}

const GESTURE_COLORS: Record<GestureType, string> = {
  none: "text-stone-500",
  palm: "text-amber-400",
  point: "text-emerald-400",
  pinch: "text-blue-400",
  fist: "text-orange-400",
  thumbsup: "text-emerald-300",
  wave: "text-violet-400",
};

// Guide items: [icon, label]
const GUIDE_1H: Array<[string, string]> = [
  ["\u270B", "Rotate"],
  ["\uD83E\uDD0F", "Zoom"],
  ["\u261D\uFE0F", "Select"],
  ["\u270A", "Pan"],
  ["\uD83D\uDC4D", "Confirm"],
  ["\uD83D\uDC4B", "Reset"],
];
const GUIDE_2H: Array<[string, string]> = [
  ["\uD83E\uDD0F\uD83E\uDD0F", "Zoom"],
  ["\u270A\u270A", "Rotate"],
];

export function HandOverlay({ videoRef, landmarks, gesture, isActive, hands, pinchDistance, palmPosition }: HandOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 16, y: 16 });
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startScale: number } | null>(null);

  // Drag from status bar
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({ x: dragRef.current.startPosX + (ev.clientX - dragRef.current.startX), y: dragRef.current.startPosY - (ev.clientY - dragRef.current.startY) });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [pos]);

  // Resize from corner handle
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startScale: scale };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const dy = -(ev.clientY - resizeRef.current.startY);
      const delta = (dx + dy) / 200;
      setScale(Math.max(0.6, Math.min(2.5, resizeRef.current.startScale + delta)));
    };
    const onUp = () => { resizeRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [scale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !video) return;

    let animFrame = 0;

    function draw() {
      if (!canvas || !ctx || !video) return;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      if (video.readyState >= 2) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -w, 0, w, h);
        ctx.restore();
      }

      const handColors = ["rgba(245, 158, 11, 0.7)", "rgba(59, 130, 246, 0.7)"];
      const dotColors = ["rgba(245, 158, 11, 0.9)", "rgba(59, 130, 246, 0.9)"];
      const handsToDraw = hands && hands.length > 0 ? hands : landmarks.length > 0 ? [{ landmarks }] : [];
      handsToDraw.forEach((hand, hi) => {
        const lm = hand.landmarks;
        if (!lm || lm.length === 0) return;

        ctx.strokeStyle = handColors[hi % handColors.length];
        ctx.lineWidth = 2;
        for (const [a, b] of CONNECTIONS) {
          const la = lm[a];
          const lb = lm[b];
          if (!la || !lb) continue;
          ctx.beginPath();
          ctx.moveTo((1 - la.x) * w, la.y * h);
          ctx.lineTo((1 - lb.x) * w, lb.y * h);
          ctx.stroke();
        }

        for (const pt of lm) {
          ctx.beginPath();
          ctx.arc((1 - pt.x) * w, pt.y * h, 3, 0, Math.PI * 2);
          ctx.fillStyle = dotColors[hi % dotColors.length];
          ctx.fill();
        }
      });

      animFrame = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animFrame);
  }, [videoRef, landmarks, hands]);

  const handCount = hands?.length || 0;
  const borderColor = isActive ? "border-emerald-500/60" : "border-stone-700/60";
  const label = getDetailedLabel(gesture, pinchDistance, palmPosition, handCount);
  const colorClass = GESTURE_COLORS[gesture];

  return (
    <div
      className="absolute z-20"
      style={{ left: pos.x, bottom: pos.y, transformOrigin: "bottom left", transform: `scale(${scale})` }}
    >
      <div className={`rounded-xl border-2 ${borderColor} overflow-hidden bg-black/90 backdrop-blur-sm shadow-2xl relative`} style={{ width: 240 }}>
        {/* Camera feed */}
        <canvas ref={canvasRef} width={240} height={180} className="block" />

        {/* Resize handle — top-right corner */}
        <div
          className="absolute top-0 right-0 w-5 h-5 cursor-nw-resize group"
          onMouseDown={onResizeStart}
          data-nodrag
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="absolute top-1 right-1 text-stone-600 group-hover:text-stone-400">
            <path d="M11 1L1 11M11 5L5 11M11 9L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* Gesture status bar — draggable handle */}
        <div className="px-3 py-2 border-t border-stone-800/60 cursor-grab active:cursor-grabbing select-none" onMouseDown={onDragStart}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm leading-none">{GESTURE_ICONS[gesture]}</span>
              <span className={`text-xs font-semibold ${colorClass}`}>{label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-400 animate-pulse" : "bg-stone-600"}`} />
              <span className="text-[10px] text-stone-400">
                {isActive ? `${handCount} hand${handCount !== 1 ? "s" : ""}` : "waiting"}
              </span>
            </div>
          </div>
        </div>

        {/* Gesture guide */}
        <div className="px-3 py-2 border-t border-stone-800/40 bg-stone-900/80">
          <p className="text-[9px] text-stone-500 uppercase tracking-wider mb-1.5">One hand</p>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1 mb-2">
            {GUIDE_1H.map(([icon, text]) => (
              <div key={text} className="flex items-center gap-1">
                <span className="text-xs leading-none">{icon}</span>
                <span className="text-[10px] text-stone-400">{text}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-stone-500 uppercase tracking-wider mb-1.5">Two hands</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {GUIDE_2H.map(([icon, text]) => (
              <div key={text} className="flex items-center gap-1">
                <span className="text-xs leading-none">{icon}</span>
                <span className="text-[10px] text-stone-400">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
