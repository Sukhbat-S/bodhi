import { useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GestureState } from "../hooks/useHandGesture";

interface GestureControllerProps {
  gesture: GestureState;
  nodes: Array<{ id: string; x: number; y: number; z: number }>;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}

export function GestureController({ gesture, nodes, onHover, onClick }: GestureControllerProps) {
  const { camera } = useThree();
  const spherical = useRef(new THREE.Spherical(100, Math.PI / 2, 0));
  const target = useRef(new THREE.Vector3(0, 0, 0));
  const prevPalm = useRef({ x: 0.5, y: 0.5 });
  const hoveredRef = useRef<string | null>(null);
  const confirmCooldown = useRef(0);
  const cursorRef = useRef<THREE.Group>(null);
  const cursorPos = useRef(new THREE.Vector3(0, 0, 0));
  const prevInterPalm = useRef(0);

  useFrame(() => {
    if (!gesture.isActive) {
      if (cursorRef.current) cursorRef.current.visible = false;
      return;
    }

    const { palmPosition, pinchDistance } = gesture;
    const dx = palmPosition.x - prevPalm.current.x;
    const dy = palmPosition.y - prevPalm.current.y;
    prevPalm.current = { ...palmPosition };
    if (confirmCooldown.current > 0) confirmCooldown.current--;

    // Hide cursor by default, show only during point
    if (cursorRef.current) cursorRef.current.visible = false;

    // Two-hand gestures first
    if (gesture.handCount >= 2 && gesture.hands.length >= 2) {
      const h0 = gesture.hands[0];
      const h1 = gesture.hands[1];
      const interPalmDist = Math.sqrt(
        (h0.palmPosition.x - h1.palmPosition.x) ** 2 +
        (h0.palmPosition.y - h1.palmPosition.y) ** 2
      );
      const interDelta = interPalmDist - (prevInterPalm.current || interPalmDist);
      prevInterPalm.current = interPalmDist;

      const bothPinching = h0.pinchDistance < 0.07 && h1.pinchDistance < 0.07;
      const bothFists = h0.gesture === "fist" && h1.gesture === "fist";
      const bothPalms = h0.gesture === "palm" && h1.gesture === "palm";

      if (bothPinching) {
        // Spread / Compress: two-hand zoom
        const zoomSpeed = interDelta * 300;
        spherical.current.radius = THREE.MathUtils.clamp(
          spherical.current.radius - zoomSpeed,
          10, 500
        );
        const pos = new THREE.Vector3().setFromSpherical(spherical.current).add(target.current);
        camera.position.lerp(pos, 0.1);
        camera.lookAt(target.current);
        return;
      }

      if (bothFists) {
        // Bimanual rotate: average movement of both palms
        const avgDx = ((h0.palmPosition.x - prevPalm.current.x) + (h1.palmPosition.x - prevPalm.current.x)) / 2;
        const avgDy = ((h0.palmPosition.y - prevPalm.current.y) + (h1.palmPosition.y - prevPalm.current.y)) / 2;
        spherical.current.theta -= avgDx * 4;
        spherical.current.phi += avgDy * 4;
        spherical.current.phi = THREE.MathUtils.clamp(spherical.current.phi, 0.1, Math.PI - 0.1);
        const pos = new THREE.Vector3().setFromSpherical(spherical.current).add(target.current);
        camera.position.lerp(pos, 0.1);
        camera.lookAt(target.current);
        return;
      }

      if (bothPalms && Math.abs(interDelta) > 0.005) {
        // Expand / contract: move target outward (visual only — no force sim change)
        // Use as a secondary zoom with different feel
        spherical.current.radius = THREE.MathUtils.clamp(
          spherical.current.radius - interDelta * 200,
          10, 500
        );
        const pos = new THREE.Vector3().setFromSpherical(spherical.current).add(target.current);
        camera.position.lerp(pos, 0.08);
        camera.lookAt(target.current);
        return;
      }
    }

    // Single-hand gestures
    switch (gesture.gesture) {
      case "palm": {
        spherical.current.theta -= dx * 3;
        spherical.current.phi += dy * 3;
        spherical.current.phi = THREE.MathUtils.clamp(spherical.current.phi, 0.1, Math.PI - 0.1);
        const pos = new THREE.Vector3().setFromSpherical(spherical.current).add(target.current);
        camera.position.lerp(pos, 0.1);
        camera.lookAt(target.current);
        break;
      }

      case "pinch": {
        const zoomDelta = (0.1 - pinchDistance) * 200;
        spherical.current.radius = THREE.MathUtils.clamp(
          spherical.current.radius + zoomDelta * 0.3,
          10, 500
        );
        const pos = new THREE.Vector3().setFromSpherical(spherical.current).add(target.current);
        camera.position.lerp(pos, 0.1);
        camera.lookAt(target.current);
        break;
      }

      case "fist": {
        target.current.x -= dx * 50;
        target.current.y += dy * 50;
        const pos = new THREE.Vector3().setFromSpherical(spherical.current).add(target.current);
        camera.position.lerp(pos, 0.1);
        camera.lookAt(target.current);
        break;
      }

      case "point": {
        if (gesture.landmarks.length > 8) {
          const tip = gesture.landmarks[8];
          const screenX = (1 - tip.x) * 2 - 1;
          const screenY = -(tip.y * 2 - 1);

          // 3D cursor: cast ray from camera through fingertip NDC, intersect z=0 plane
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(screenX, screenY), camera);
          const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
          const hitPoint = new THREE.Vector3();
          raycaster.ray.intersectPlane(plane, hitPoint);
          if (hitPoint) cursorPos.current.lerp(hitPoint, 0.3);

          // Show cursor via ref (no re-render)
          if (cursorRef.current) {
            cursorRef.current.visible = true;
            cursorRef.current.position.copy(cursorPos.current);
          }

          // Find nearest node
          let nearest: string | null = null;
          let minDist = 0.15;
          for (const node of nodes) {
            const nodePos = new THREE.Vector3(node.x, node.y, node.z);
            nodePos.project(camera);
            const nd = Math.sqrt((nodePos.x - screenX) ** 2 + (nodePos.y - screenY) ** 2);
            if (nd < minDist) { minDist = nd; nearest = node.id; }
          }
          if (nearest !== hoveredRef.current) {
            hoveredRef.current = nearest;
            onHover(nearest);
          }
        }
        break;
      }

      case "thumbsup": {
        if (hoveredRef.current && confirmCooldown.current === 0) {
          onClick(hoveredRef.current);
          confirmCooldown.current = 30;
        }
        break;
      }

      case "wave": {
        spherical.current.set(100, Math.PI / 2, 0);
        target.current.set(0, 0, 0);
        const pos = new THREE.Vector3().setFromSpherical(spherical.current);
        camera.position.lerp(pos, 0.05);
        camera.lookAt(target.current);
        break;
      }
    }
  });

  return (
    <group ref={cursorRef} visible={false}>
      <mesh>
        <sphereGeometry args={[0.4, 12, 12]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={3} transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <mesh scale={3}>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.08} toneMapped={false} />
      </mesh>
    </group>
  );
}
