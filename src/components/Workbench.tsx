import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownUp,
  Check,
  Expand,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  ScanLine,
} from 'lucide-react';
import type { Editor } from '../editor/useEditor';
import { context } from '../imaging/assets';
import { releaseRender, renderArtwork } from '../imaging/render';
import { Segmented, Slider } from './Primitives';
import { HoleOverlay } from './HoleOverlay';
import { compositionGeometry } from '../domain/composition';

export function Workbench({ editor }: { editor: Editor }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState('');
  const [rendering, setRendering] = useState(false);
  const { photo, paper, settings, scene } = editor;
  const dimensions = scene ? compositionGeometry(scene, 960, settings.paperFirst).combined : null;
  useEffect(() => {
    if (!photo || !scene) return;
    setRendering(true);
    const frame = requestAnimationFrame(() => {
      let result: ReturnType<typeof renderArtwork> | undefined;
      try {
        result = renderArtwork(photo, paper, settings, scene, 960);
        if (canvasRef.current) {
          const target = canvasRef.current;
          target.width = result.combined.width;
          target.height = result.combined.height;
          context(target).drawImage(result.combined, 0, 0);
        }
        setRenderError('');
      } catch (error) {
        setRenderError(error instanceof Error ? error.message : '预览暂时不可用。');
      } finally {
        if (result) releaseRender(result);
        setRendering(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [photo, paper, settings, scene]);
  return (
    <section className="workbench" aria-label="作品预览">
      <div className="workbench-toolbar">
        <div>
          <span className="tiny-dot" />
          <strong>{settings.composition === 'surround' ? '外围色纸画布' : '双联画布'}</strong>
          <span className="live-tag">LIVE PREVIEW</span>
        </div>
        <button
          className="icon-button"
          aria-label="全屏预览"
          title="全屏预览"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else
              void viewportRef.current
                ?.requestFullscreen()
                .catch(() => editor.setError('当前浏览器不支持全屏预览。'));
          }}
        >
          <Expand size={16} />
        </button>
      </div>
      <div className="preview-viewport" ref={viewportRef}>
        <div className="canvas-meta">
          <span>{scene ? `FRAME / ${scene.ratioLabel}` : 'YOUR NEXT COLLAGE'}</span>
          <span>{scene ? `${scene.fragments.length} PIECES` : 'NO. 001'}</span>
        </div>
        <div className="artwork-stage" ref={stageRef}>
          {photo ? (
            <canvas
              ref={canvasRef}
              width={dimensions?.width}
              height={dimensions?.height}
              data-testid="artwork"
              aria-label="打孔照片与色纸碎片组成的作品"
            />
          ) : (
            <div className="empty-artwork">
              <div className="empty-paper">
                <span className="empty-eye e1" />
                <span className="empty-eye e2" />
                <span className="empty-eye e3" />
                <span className="empty-eye e4" />
                <span className="empty-eye e5" />
              </div>
              <div className="empty-caption">
                <ImagePlus size={28} strokeWidth={1.3} />
                <h2>从一张照片开始</h2>
                <p>
                  取下细节，交换色彩。
                  <br />
                  把熟悉的画面，重新排列。
                </p>
                <span>← 上传底图或选一张样片</span>
              </div>
              <div className="empty-stamp">
                CUT.
                <br />
                SWAP.
                <br />
                PLAY.
              </div>
            </div>
          )}
          {photo && scene && !editor.loading && (
            <HoleOverlay
              key={photo.id}
              canvasRef={canvasRef}
              stageRef={stageRef}
              scene={scene}
              settings={settings}
              longEdge={960}
              onMove={editor.movePiece}
              onRestore={(side, positions) =>
                editor.patch({
                  [side === 'source' ? 'sourcePositions' : 'targetPositions']: positions,
                })
              }
            />
          )}
          {editor.loading && (
            <div className="preview-loading">
              <LoaderCircle className="spin" size={24} />
              <span>正在准备你的画面</span>
            </div>
          )}
        </div>
        <div className="canvas-meta bottom">
          <span>
            {photo
              ? settings.composition === 'surround'
                ? '照片居中 / 碎片环绕四周'
                : settings.paperFirst
                  ? '01 / 色纸 → 02 / 照片'
                  : '01 / 照片 → 02 / 色纸'
              : 'A LITTLE CUT. A NEW PERSPECTIVE.'}
          </span>
          <span>
            <Maximize2 size={11} /> 适应画布
          </span>
        </div>
      </div>
      <div className="composition-bar">
        <label>拼接方式</label>
        <Segmented
          label="拼接方向"
          value={settings.composition}
          options={[
            { value: 'auto', label: '自动' },
            { value: 'vertical', label: '上下' },
            { value: 'horizontal', label: '左右' },
            { value: 'surround', label: '外围色纸' },
          ]}
          onChange={editor.setComposition}
        />
        <button
          className="swap-button"
          disabled={settings.composition === 'surround'}
          onClick={() => editor.patch({ paperFirst: !settings.paperFirst })}
        >
          <ArrowDownUp size={14} /> 交换顺序
        </button>
      </div>
      {settings.composition === 'surround' && (
        <div className="border-controls">
          <Slider
            label="外围宽度"
            min={10}
            max={60}
            step={1}
            value={settings.borderWidth * 100}
            suffix="%"
            onChange={(value) => editor.patch({ borderWidth: value / 100 })}
          />
          <p className="microcopy">按照片短边的比例扩展四周，沿用当前底色。</p>
        </div>
      )}
      {photo && (
        <p className="hole-help">
          照片上的孔与色纸上的碎片都可直接拖动，方向键微调，拖动中按 Esc 取消。
        </p>
      )}
      <div className="preview-note">
        <span>
          {photo ? (
            <>
              <Check size={13} /> {rendering ? '更新预览中' : '实时预览已更新'}
            </>
          ) : (
            <>
              <ScanLine size={13} /> 每一个孔，都有一块对应的碎片
            </>
          )}
        </span>
        <span>
          {scene
            ? `${scene.orientation === 'surround' ? '外围色纸' : scene.orientation === 'vertical' ? '上下双联' : '左右双联'} · ${scene.ratioLabel}`
            : '照片 × 色纸'}
        </span>
      </div>
      {scene?.notices.map((notice) => (
        <p className="notice" key={notice} role="status">
          {notice}
        </p>
      ))}
      {renderError && (
        <p className="error-message" role="alert">
          {renderError}
        </p>
      )}
      <div className="process-legend">
        <span>
          <i>1</i> 从照片打孔
        </span>
        <span className="legend-line" />
        <span>
          <i>2</i> 与色纸交换
        </span>
        <span className="legend-line" />
        <span>
          <i>3</i> 重新排列碎片
        </span>
      </div>
    </section>
  );
}
