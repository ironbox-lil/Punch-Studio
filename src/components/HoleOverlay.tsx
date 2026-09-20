import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { compositionGeometry } from '../domain/composition';
import { SHAPES } from '../domain/shapes';
import type { EditorSettings, PieceSide, Point, Scene } from '../domain/types';

type Gesture = {
  pointer: number;
  side: PieceSide;
  index: number;
  origin: Point;
  start: Point;
  previous: Point[] | null;
};

export function HoleOverlay({
  canvasRef,
  stageRef,
  scene,
  settings,
  longEdge,
  onMove,
  onRestore,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  scene: Scene;
  settings: EditorSettings;
  longEdge: number;
  onMove: (side: PieceSide, index: number, point: Point) => void;
  onRestore: (side: PieceSide, positions: Point[] | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [box, setBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const geometry = compositionGeometry(scene, longEdge, settings.paperFirst);
  const scale = geometry.panel.height;

  useLayoutEffect(() => {
    const canvas = canvasRef.current,
      stage = stageRef.current;
    if (!canvas || !stage) return;
    const measure = () => {
      const bounds = canvas.getBoundingClientRect(),
        parent = stage.getBoundingClientRect();
      setBox({
        x: bounds.left - parent.left,
        y: bounds.top - parent.top,
        width: bounds.width,
        height: bounds.height,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    observer.observe(stage);
    measure();
    return () => observer.disconnect();
  }, [canvasRef, stageRef, geometry.combined.width, geometry.combined.height]);

  const pointAt = (event: PointerEvent, side: PieceSide): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const panel = side === 'source' ? geometry.photo : geometry.paper;
    return {
      x: (((event.clientX - rect.left) / rect.width) * geometry.combined.width - panel.x) / scale,
      y: (((event.clientY - rect.top) / rect.height) * geometry.combined.height - panel.y) / scale,
    };
  };
  const finish = (cancel: boolean) => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    if (cancel) onRestore(active.side, active.previous);
    if (svgRef.current?.hasPointerCapture(active.pointer))
      svgRef.current.releasePointerCapture(active.pointer);
  };
  const nudge = (event: KeyboardEvent, side: PieceSide, index: number) => {
    if (event.key === 'Escape') {
      finish(true);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const point = scene.fragments[index]![side];
    const step = Math.min(scene.frame.width, 1) * (event.shiftKey ? 0.05 : 0.005);
    setSelected(`${side}-${index}`);
    onMove(side, index, {
      x: point.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
      y: point.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
    });
  };
  const hitRadius = Math.max(
    scene.size * scale * Math.SQRT1_2,
    (10 * geometry.combined.width) / Math.max(1, box.width),
  );

  if (!box.width || !box.height) return null;
  return (
    <svg
      ref={svgRef}
      className="hole-overlay"
      aria-label="照片孔位与色纸碎片拖动区"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      viewBox={`0 0 ${geometry.combined.width} ${geometry.combined.height}`}
      onPointerMove={(event) => {
        const active = gesture.current;
        if (!active || active.pointer !== event.pointerId) return;
        event.preventDefault();
        const point = pointAt(event, active.side);
        onMove(active.side, active.index, {
          x: active.origin.x + point.x - active.start.x,
          y: active.origin.y + point.y - active.start.y,
        });
      }}
      onPointerUp={(event) => {
        if (gesture.current?.pointer === event.pointerId) finish(false);
      }}
      onPointerCancel={(event) => {
        if (gesture.current?.pointer === event.pointerId) finish(true);
      }}
      onLostPointerCapture={() => {
        gesture.current = null;
      }}
    >
      {(['source', 'target'] as const).flatMap((side) =>
        scene.fragments.map((fragment, index) => {
          const panel = side === 'source' ? geometry.photo : geometry.paper;
          const id = `${side}-${index}`;
          return (
            <g
              key={id}
              className={`hole-control ${selected === id ? 'is-selected' : ''}`}
              transform={`translate(${panel.x + fragment[side].x * scale} ${panel.y + fragment[side].y * scale})`}
              role="button"
              tabIndex={0}
              aria-label={`拖动第 ${index + 1} 个${side === 'source' ? '孔' : '碎片'}`}
              data-testid={`${side === 'source' ? 'hole' : 'fragment'}-${index}`}
              onKeyDown={(event) => nudge(event, side, index)}
              onPointerDown={(event) => {
                if (event.button !== 0 || gesture.current) return;
                event.preventDefault();
                event.currentTarget.focus();
                setSelected(id);
                gesture.current = {
                  pointer: event.pointerId,
                  side,
                  index,
                  origin: fragment[side],
                  start: pointAt(event, side),
                  previous: side === 'source' ? settings.sourcePositions : settings.targetPositions,
                };
                svgRef.current?.setPointerCapture(event.pointerId);
              }}
            >
              <circle r={hitRadius} className="hole-hit-area" />
              <circle
                r={hitRadius}
                className="hole-selection-ring"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={SHAPES[settings.shape ?? 'circle'].path}
                transform={`rotate(${side === 'target' ? (fragment.rotation * 180) / Math.PI : 0}) scale(${(scene.size * scale) / 100})`}
                className="hole-outline"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        }),
      )}
    </svg>
  );
}
