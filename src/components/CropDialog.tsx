import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import {
  CROP_HANDLES,
  fitCrop,
  moveCrop,
  normalizeCrop,
  photoCrop,
  resizeCrop,
  zoomCrop,
  type CropHandle,
} from '../domain/crop';
import { cropRect, panelSize, RATIOS, resolveRatio } from '../domain/ratios';
import type { EditorSettings, PhotoCrop } from '../domain/types';
import { context, type ImageAsset } from '../imaging/assets';
import { Slider } from './Primitives';

const HANDLE_NAMES: Record<CropHandle, string> = {
  nw: '左上角',
  n: '上边',
  ne: '右上角',
  e: '右边',
  se: '右下角',
  s: '下边',
  sw: '左下角',
  w: '左边',
};
type Drag = { pointer: number; x: number; y: number; rect: PhotoCrop; handle: CropHandle | 'move' };

export function CropDialog({
  photo,
  settings,
  onApply,
  onClose,
}: {
  photo: ImageAsset;
  settings: EditorSettings;
  onApply: (values: Pick<EditorSettings, 'crop' | 'ratio'>) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [ratio, setRatio] = useState(settings.ratio);
  const [crop, setCrop] = useState(() => normalizeCrop(photoCrop(photo, settings), photo));
  const pixelRatio = (crop.width * photo.width) / (crop.height * photo.height);
  const zoom = cropRect(photo, pixelRatio).width / (crop.width * photo.width);
  const lockedRatio =
    ratio === 'free' ? null : (resolveRatio(photo, ratio).value * photo.height) / photo.width;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = panelSize(photo.width / photo.height, 1200);
    canvas.width = size.width;
    canvas.height = size.height;
    context(canvas).drawImage(photo.bitmap, 0, 0, size.width, size.height);
  }, [photo]);

  const startDrag = (event: PointerEvent, handle: Drag['handle']) => {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    stageRef.current?.setPointerCapture(event.pointerId);
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rect: crop,
      handle,
    };
  };
  const moveDrag = (event: PointerEvent) => {
    const active = drag.current;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!active || active.pointer !== event.pointerId || !bounds) return;
    const delta = {
      x: (event.clientX - active.x) / bounds.width,
      y: (event.clientY - active.y) / bounds.height,
    };
    setCrop(
      active.handle === 'move'
        ? moveCrop(active.rect, delta)
        : resizeCrop(active.rect, active.handle, delta, lockedRatio),
    );
  };
  const endDrag = (event: PointerEvent) => {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    if (stageRef.current?.hasPointerCapture(event.pointerId))
      stageRef.current.releasePointerCapture(event.pointerId);
  };
  const nudge = (event: KeyboardEvent, handle: Drag['handle']) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const delta = {
      x: (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0) / photo.width,
      y: (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) / photo.height,
    };
    setCrop((current) =>
      handle === 'move'
        ? moveCrop(current, delta)
        : resizeCrop(current, handle, delta, lockedRatio),
    );
  };

  return (
    <dialog ref={dialogRef} className="crop-dialog" aria-labelledby="crop-title" onCancel={onClose}>
      <div className="dialog-heading">
        <div>
          <h2 id="crop-title">自由裁剪底图</h2>
          <p>拖动选区移动位置，拖动边角调整范围。</p>
        </div>
        <button className="icon-button" aria-label="关闭裁剪" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      <div className="crop-preview-area">
        <div
          ref={stageRef}
          className="crop-stage"
          data-testid="crop-stage"
          style={{
            aspectRatio: photo.width / photo.height,
            maxWidth: `${(520 * photo.width) / photo.height}px`,
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <canvas ref={canvasRef} aria-label="待裁剪的完整底图" />
          <div
            className="crop-selection"
            data-testid="crop-selection"
            role="group"
            aria-label="裁剪区域，方向键微调位置"
            tabIndex={0}
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
            }}
            onPointerDown={(event) => startDrag(event, 'move')}
            onKeyDown={(event) => nudge(event, 'move')}
          >
            <div className="crop-thirds" aria-hidden="true" />
            {CROP_HANDLES.map((handle) => (
              <button
                key={handle}
                className={`crop-handle crop-handle-${handle}`}
                aria-label={`调整裁剪框${HANDLE_NAMES[handle]}`}
                onPointerDown={(event) => startDrag(event, handle)}
                onKeyDown={(event) => nudge(event, handle)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="crop-controls">
        <label className="select-row">
          裁剪比例
          <select
            aria-label="裁剪比例"
            value={ratio}
            onChange={(event) => {
              const next = event.target.value;
              setRatio(next);
              if (next !== 'free')
                setCrop((current) => fitCrop(current, photo, resolveRatio(photo, next).value));
            }}
          >
            <option value="free">自由比例</option>
            <option value="auto">自动 · {resolveRatio(photo, 'auto').label}</option>
            {RATIOS.map((item) => (
              <option key={item.label}>{item.label}</option>
            ))}
          </select>
        </label>
        <Slider
          label="裁剪缩放"
          min={1}
          max={Math.max(8, Math.ceil(zoom))}
          step={0.01}
          value={zoom}
          suffix="×"
          onChange={(value) => setCrop((current) => zoomCrop(current, photo, value))}
        />
        <div className="crop-dimensions" aria-live="polite">
          选区尺寸{' '}
          <strong>
            {Math.round(crop.width * photo.width)} × {Math.round(crop.height * photo.height)} px
          </strong>
        </div>
      </div>
      <p className="microcopy">
        原图保留，可随时重新裁剪。选区和边角支持方向键微调，按住 Shift 每次移动 10 像素。
      </p>
      <div className="crop-actions">
        <button
          className="text-button"
          onClick={() => {
            setRatio('auto');
            setCrop(normalizeCrop(photoCrop(photo, { ratio: 'auto', crop: null }), photo));
          }}
        >
          <RotateCcw size={14} />
          重置裁剪
        </button>
        <button className="crop-cancel" onClick={onClose}>
          取消
        </button>
        <button
          className="primary-button"
          onClick={() => {
            onApply({ crop, ratio });
            onClose();
          }}
        >
          <Check size={15} />
          应用裁剪
        </button>
      </div>
    </dialog>
  );
}
