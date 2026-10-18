"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import { Vector3, type Group } from "three";

/**
 * drei <Html> that hides while its point is behind the camera (Html alone mirrors such
 * points onto the screen, so a doorway behind you would show its label ahead).
 */
export function FrontHtml({
  position,
  children,
  zIndexRange = [20, 10],
}: {
  position: [number, number, number];
  children: ReactNode;
  zIndexRange?: [number, number];
}) {
  const point = useRef<Group>(null);
  const el = useRef<HTMLDivElement>(null);
  const [toPoint, view] = useMemo(() => [new Vector3(), new Vector3()], []);
  useFrame(({ camera }) => {
    if (!point.current || !el.current) return;
    point.current.getWorldPosition(toPoint).sub(camera.position);
    camera.getWorldDirection(view);
    el.current.style.visibility = toPoint.dot(view) > 0.05 ? "visible" : "hidden";
  });
  return (
    <group ref={point} position={position}>
      <Html center zIndexRange={zIndexRange}>
        <div ref={el} style={{ visibility: "hidden" }}>
          {children}
        </div>
      </Html>
    </group>
  );
}
