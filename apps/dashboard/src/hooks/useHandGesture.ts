import { useEffect, useRef, useState, useCallback } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// MediaPipe hand landmark indices
const WRIST = 0;
const THUMB_TIP = 4;
const THUMB_IP = 3;
const INDEX_TIP = 8;
const INDEX_PIP = 6;
const MIDDLE_TIP = 12;
const MIDDLE_PIP = 10;
const RING_TIP = 16;
const RING_PIP = 14;
const PINKY_TIP = 20;
const PINKY_PIP = 18;
const MCP_JOINTS = [5, 9, 13, 17]; // base of each finger

export type GestureType = "none" | "palm" | "point" | "pinch" | "fist" | "thumbsup" | "wave";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandState {
  gesture: GestureType;
  landmarks: Landmark[];
  palmPosition: { x: number; y: number };
  pinchDistance: number;
}

export interface GestureState {
  gesture: GestureType;
  landmarks: Landmark[];
  palmPosition: { x: number; y: number };
  pinchDistance: number;
  confidence: number;
  isActive: boolean;
  hands: HandState[];
  handCount: number;
}

const INITIAL_STATE: GestureState = {
  gesture: "none",
  landmarks: [],
  palmPosition: { x: 0.5, y: 0.5 },
  pinchDistance: 1,
  confidence: 0,
  isActive: false,
  hands: [],
  handCount: 0,
};

function dist(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function isExtended(tip: Landmark, pip: Landmark, wrist: Landmark): boolean {
  return dist(tip, wrist) > dist(pip, wrist);
}

function classifyGesture(landmarks: Landmark[], prevPalmX: number): { gesture: GestureType; palmPosition: { x: number; y: number }; pinchDistance: number } {
  const wrist = landmarks[WRIST];

  // Finger extension states
  const thumbOut = isExtended(landmarks[THUMB_TIP], landmarks[THUMB_IP], wrist);
  const indexOut = isExtended(landmarks[INDEX_TIP], landmarks[INDEX_PIP], wrist);
  const middleOut = isExtended(landmarks[MIDDLE_TIP], landmarks[MIDDLE_PIP], wrist);
  const ringOut = isExtended(landmarks[RING_TIP], landmarks[RING_PIP], wrist);
  const pinkyOut = isExtended(landmarks[PINKY_TIP], landmarks[PINKY_PIP], wrist);

  // Palm position: average of wrist + MCP joints
  const palmPoints = [wrist, ...MCP_JOINTS.map((i) => landmarks[i])];
  const palmX = palmPoints.reduce((s, p) => s + p.x, 0) / palmPoints.length;
  const palmY = palmPoints.reduce((s, p) => s + p.y, 0) / palmPoints.length;
  const palmPosition = { x: palmX, y: palmY };

  // Pinch distance: thumb tip to index tip
  const pinchDistance = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]);

  // Wave detection: large horizontal palm movement
  const palmDeltaX = Math.abs(palmX - prevPalmX);
  if (palmDeltaX > 0.08) {
    return { gesture: "wave", palmPosition, pinchDistance };
  }

  // Pinch: thumb and index close together
  if (pinchDistance < 0.06) {
    return { gesture: "pinch", palmPosition, pinchDistance };
  }

  // Thumbs up: only thumb extended, hand roughly upright
  if (thumbOut && !indexOut && !middleOut && !ringOut && !pinkyOut) {
    if (landmarks[THUMB_TIP].y < landmarks[THUMB_IP].y) {
      return { gesture: "thumbsup", palmPosition, pinchDistance };
    }
  }

  // Fist: no fingers extended
  if (!thumbOut && !indexOut && !middleOut && !ringOut && !pinkyOut) {
    return { gesture: "fist", palmPosition, pinchDistance };
  }

  // Point: only index extended
  if (indexOut && !middleOut && !ringOut && !pinkyOut) {
    return { gesture: "point", palmPosition, pinchDistance };
  }

  // Open palm: all fingers extended
  if (indexOut && middleOut && ringOut && pinkyOut) {
    return { gesture: "palm", palmPosition, pinchDistance };
  }

  return { gesture: "none", palmPosition, pinchDistance };
}

export function useHandGesture(enabled: boolean) {
  const [state, setState] = useState<GestureState>(INITIAL_STATE);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animFrameRef = useRef<number>(0);
  const prevPalmXRef = useRef(0.5);
  const streamRef = useRef<MediaStream | null>(null);

  // Create video element for webcam
  const getVideo = useCallback(() => {
    if (!videoRef.current) {
      const video = document.createElement("video");
      video.setAttribute("playsinline", "");
      video.setAttribute("autoplay", "");
      video.style.display = "none";
      document.body.appendChild(video);
      videoRef.current = video;
    }
    return videoRef.current;
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Cleanup when disabled
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setState(INITIAL_STATE);
      return;
    }

    let cancelled = false;

    async function init() {
      // Request camera FIRST (triggers permission prompt immediately)
      // Load MediaPipe WASM in parallel
      const video = getVideo();
      console.log("[gesture] Requesting camera...");
      const [stream, vision] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        }),
        FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        ),
      ]);
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      console.log("[gesture] Camera + WASM loaded");

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });
      if (cancelled) return;
      handLandmarkerRef.current = handLandmarker;
      console.log("[gesture] HandLandmarker ready");

      // Detection loop
      function detect() {
        if (cancelled) return;
        const video = videoRef.current;
        const hl = handLandmarkerRef.current;
        if (!video || !hl || video.readyState < 2) {
          animFrameRef.current = requestAnimationFrame(detect);
          return;
        }

        const result = hl.detectForVideo(video, performance.now());
        if (result.landmarks && result.landmarks.length > 0) {
          // Process all detected hands
          const hands: HandState[] = result.landmarks.map((lm) => {
            const landmarks = lm as Landmark[];
            const classified = classifyGesture(landmarks, prevPalmXRef.current);
            return { landmarks, ...classified };
          });

          // Primary hand = first detected (used for main gesture)
          const primary = hands[0];
          prevPalmXRef.current = primary.palmPosition.x;

          // Merge all landmarks for overlay drawing
          const allLandmarks = hands.flatMap((h) => h.landmarks);

          setState({
            gesture: primary.gesture,
            landmarks: allLandmarks,
            palmPosition: primary.palmPosition,
            pinchDistance: primary.pinchDistance,
            confidence: 1,
            isActive: true,
            hands,
            handCount: hands.length,
          });
        } else {
          setState((prev) => ({ ...prev, gesture: "none", landmarks: [], isActive: false, confidence: 0, hands: [], handCount: 0 }));
        }

        animFrameRef.current = requestAnimationFrame(detect);
      }

      detect();
    }

    init().catch((err) => {
      console.error("[gesture] Init failed:", err);
      setState(INITIAL_STATE);
    });

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
        handLandmarkerRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.remove();
        videoRef.current = null;
      }
    };
  }, [enabled, getVideo]);

  return { ...state, videoRef };
}
