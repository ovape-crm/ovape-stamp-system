"use client";
/* eslint-disable @next/next/no-img-element -- 외부 이미지 URL을 직접 표시한다. */

import { useRef, useState } from "react";

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
  zoomClassName?: string;
  style?: React.CSSProperties;
}

const MAX_ZOOM = 3;

export default function ZoomableImage({ src, alt, className, zoomClassName, style }: ZoomableImageProps) {
  const [zoom, setZoom] = useState(1);
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 });
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const zoomRef = useRef(1);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistanceRef = useRef<number | null>(null);
  const isZoomed = zoom > 1;

  const captureBaseSize = () => {
    if (zoomRef.current !== 1) return;
    const rect = imageRef.current?.getBoundingClientRect();
    if (rect?.width) setBaseSize({ width: rect.width, height: rect.height });
  };
  const updateZoom = (value: number, clientX: number, clientY: number) => {
    const image = imageRef.current;
    if (!image) return;
    const next = Math.min(MAX_ZOOM, Math.max(1, Math.round(value * 20) / 20));
    const rect = image.getBoundingClientRect();
    setOrigin({ x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 });
    if (next === 1) setPan({ x: 0, y: 0 });
    zoomRef.current = next;
    setZoom(next);
  };
  const clearPointer = (pointerId: number) => {
    touchPointsRef.current.delete(pointerId);
    if (touchPointsRef.current.size < 2) pinchDistanceRef.current = null;
    if (dragRef.current?.pointerId === pointerId) dragRef.current = null;
  };

  return (
    <div
      className={`max-w-full overflow-hidden ${isZoomed ? "cursor-grab" : "cursor-zoom-in"}`}
      style={isZoomed && baseSize.height ? { height: `${baseSize.height}px`, touchAction: "none" } : { touchAction: "pan-y" }}
      onWheel={(event) => { event.preventDefault(); captureBaseSize(); updateZoom(zoomRef.current + (event.deltaY < 0 ? 0.1 : -0.1), event.clientX, event.clientY); }}
      onPointerDown={(event) => {
        captureBaseSize();
        if (event.pointerType === "touch") {
          touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (touchPointsRef.current.size === 2) {
            const [a, b] = [...touchPointsRef.current.values()];
            pinchDistanceRef.current = Math.hypot(a.x - b.x, a.y - b.y);
          }
        }
        if (isZoomed && (event.pointerType === "mouse" ? event.button === 0 : touchPointsRef.current.size === 1)) {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        }
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" && touchPointsRef.current.has(event.pointerId)) {
          touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (touchPointsRef.current.size === 2 && pinchDistanceRef.current) {
            const [a, b] = [...touchPointsRef.current.values()];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            updateZoom(zoomRef.current * (distance / pinchDistanceRef.current), (a.x + b.x) / 2, (a.y + b.y) / 2);
            pinchDistanceRef.current = distance;
            return;
          }
        }
        const drag = dragRef.current;
        if (drag?.pointerId === event.pointerId) setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
      }}
      onPointerUp={(event) => clearPointer(event.pointerId)}
      onPointerCancel={(event) => clearPointer(event.pointerId)}
    >
      <img
        ref={imageRef}
        src={src}
        referrerPolicy="no-referrer"
        draggable={false}
        alt={isZoomed ? "확대 이미지" : alt}
        className={`${isZoomed ? (zoomClassName ?? className ?? "") : (className ?? "")} h-auto`}
        style={isZoomed && baseSize.width ? { width: `${baseSize.width}px`, maxWidth: "none", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%` } : style}
        onLoad={captureBaseSize}
        onDragStart={(event) => event.preventDefault()}
      />
    </div>
  );
}
