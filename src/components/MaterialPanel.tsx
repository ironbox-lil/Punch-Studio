import { useRef, useState, type DragEvent } from 'react';
import {
  ArrowUpRight,
  Check,
  Crop,
  ImagePlus,
  LoaderCircle,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { Editor } from '../editor/useEditor';
import { RATIOS, resolveRatio } from '../domain/ratios';
import { SHAPE_IDS } from '../../shared/contracts';
import { Section, Segmented, ShapeIcon } from './Primitives';
import { SHAPES } from '../domain/shapes';
import { CropDialog } from './CropDialog';

const SWATCHES = [
  '#193BCB',
  '#9B242E',
  '#DCE96D',
  '#263D2B',
  '#F4F0E6',
  '#252524',
  '#E17C5E',
  '#9782BD',
];

export function MaterialPanel({
  editor,
  onConfigure,
}: {
  editor: Editor;
  onConfigure: () => void;
}) {
  const { photo, settings, patch, paper, recommendations: rec } = editor;
  const photoInput = useRef<HTMLInputElement>(null);
  const paperInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hex, setHex] = useState('');
  const [cropping, setCropping] = useState(false);
  const recommendationsBusy = editor.loading || editor.paperLoading || rec.status === 'loading';
  const clearColor = () => {
    setHex('');
    editor.setColor(null);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void editor.upload(file, 'photo');
  };
  const commitHex = () => {
    if (!hex) return;
    const value = hex.startsWith('#') ? hex : `#${hex}`;
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      editor.setColor(value.toUpperCase());
      setHex('');
    } else editor.setError('请输入六位 HEX 颜色，例如 #193BCB。');
  };
  return (
    <aside className="material-panel" aria-label="素材与形状">
      <div className="panel-heading">
        <span>MATERIALS</span>
        <span>01 — 03</span>
      </div>
      <Section number="01" title="选择底图" subtitle="一张照片，新的可能">
        {cropping && photo && (
          <CropDialog
            key={photo.id}
            photo={photo}
            settings={settings}
            onApply={patch}
            onClose={() => setCropping(false)}
          />
        )}
        <input
          ref={photoInput}
          aria-label="上传底图"
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void editor.upload(file, 'photo');
            e.target.value = '';
          }}
        />
        <button
          className={`upload-area ${photo ? 'has-photo' : ''} ${dragging ? 'dragging' : ''}`}
          onClick={() => photoInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          {photo ? (
            <>
              <img src={photo.thumbnail} alt="当前底图缩略图" />
              <div>
                <strong>{photo.name}</strong>
                <span>
                  {photo.width} × {photo.height}
                </span>
              </div>
              <Upload size={16} />
            </>
          ) : (
            <>
              <span className="upload-icon">
                <ImagePlus size={23} strokeWidth={1.5} />
              </span>
              <strong>放入一张你的照片</strong>
              <span>拖拽到这里，或点击上传</span>
              <small>JPG / PNG / WEBP · 最大 30 MB</small>
            </>
          )}
          {editor.loading && (
            <span className="loading-cover">
              <LoaderCircle className="spin" size={22} /> 正在载入
            </span>
          )}
        </button>
        {editor.samples.length > 0 && (
          <>
            <div className="field-caption">
              也可以从测试样片开始 <ArrowUpRight size={12} />
            </div>
            <div className="sample-strip">
              {editor.samples.map((sample) => (
                <button
                  key={sample.id}
                  title={sample.name}
                  aria-label={`使用${sample.name}`}
                  onClick={() => void editor.upload(sample, 'photo')}
                >
                  <img src={sample.thumbnail} alt={sample.name} loading="lazy" />
                </button>
              ))}
            </div>
          </>
        )}
        <label className="select-row">
          画面比例
          <select
            aria-label="画面比例"
            value={settings.ratio}
            onChange={(e) => patch({ ratio: e.target.value })}
          >
            <option value="auto">
              自动{photo ? ` · ${resolveRatio(photo, 'auto').label}` : ''}
            </option>
            <option value="free">自由比例</option>
            {RATIOS.map((ratio) => (
              <option key={ratio.label}>{ratio.label}</option>
            ))}
          </select>
        </label>
        {photo && (
          <button className="crop-open" disabled={editor.loading} onClick={() => setCropping(true)}>
            <Crop size={14} />
            {settings.crop ? '调整底图裁剪' : '自由裁剪底图'}
          </button>
        )}
        <p className="microcopy">默认居中裁切，也可自由选择取景范围。</p>
      </Section>
      <Section number="02" title="一张色纸" subtitle="承接照片的碎片">
        <div className="swatches">
          {SWATCHES.map((color) => (
            <button
              key={color}
              style={{ background: color }}
              aria-label={`底色 ${color}`}
              aria-pressed={settings.color === color && settings.paperMode === 'color'}
              className={settings.color === color && settings.paperMode === 'color' ? 'active' : ''}
              onClick={() => {
                setHex('');
                editor.setColor(
                  settings.color === color && settings.paperMode === 'color' ? null : color,
                );
              }}
            >
              {settings.color === color && settings.paperMode === 'color' && (
                <Check
                  size={15}
                  style={{ color: ['#DCE96D', '#F4F0E6'].includes(color) ? '#222' : '#fff' }}
                />
              )}
            </button>
          ))}
        </div>
        <div className="color-row">
          <label className="color-picker" title="自定义底色">
            <input
              aria-label="自定义底色"
              type="color"
              value={settings.color ?? '#193BCB'}
              onChange={(e) => editor.setColor(e.target.value.toUpperCase())}
            />
          </label>
          <input
            className="hex-input"
            aria-label="HEX 颜色"
            placeholder={settings.color ?? '自定义 HEX'}
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitHex();
                e.currentTarget.blur();
              }
            }}
            maxLength={7}
          />
          <button
            className="clear-color"
            onClick={clearColor}
            disabled={rec.needsColor && !paper && !editor.paperLoading}
            aria-label="清空颜色和色纸"
          >
            <X size={13} /> 清空
          </button>
        </div>
        {rec.needsColor && <p className="microcopy">未选择颜色，可手动选择或生成 AI 建议。</p>}
        <input
          ref={paperInput}
          className="visually-hidden"
          aria-label="上传色纸"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void editor.upload(file, 'paper');
            e.target.value = '';
          }}
        />
        {paper ? (
          <div className="paper-file">
            <img src={paper.thumbnail} alt="色纸预览" />
            <div>
              <span>{paper.name}</span>
              <button className="text-button" onClick={() => paperInput.current?.click()}>
                更换色纸
              </button>
            </div>
            <button className="icon-button" aria-label="移除色纸" onClick={clearColor}>
              <X size={15} />
            </button>
          </div>
        ) : (
          <button className="paper-upload" onClick={() => paperInput.current?.click()}>
            <Upload size={14} /> {editor.paperLoading ? '载入中…' : '上传色纸 / 纹理图片'}
            <span>可选</span>
          </button>
        )}
        {paper && settings.composition !== 'surround' && (
          <Segmented
            label="色纸处理"
            value={settings.paperMode}
            options={[
              { value: 'texture', label: '保留纹理' },
              { value: 'color', label: '仅提取底色' },
            ]}
            onChange={editor.setPaperMode}
          />
        )}
        {paper && settings.composition === 'surround' && (
          <p className="microcopy">外围色纸使用纯色；上传图片仅用于提取主色，也可重新选色。</p>
        )}
      </Section>
      <Section number="03" title="打孔的形状">
        <div className="shape-grid">
          {SHAPE_IDS.map((shape) => (
            <button
              key={shape}
              aria-label={`形状 ${SHAPES[shape].name}`}
              aria-pressed={settings.shape === shape}
              className={settings.shape === shape ? 'selected' : ''}
              onClick={() => patch({ shape: settings.shape === shape ? null : shape })}
            >
              <ShapeIcon shape={shape} size={25} />
              <span>{SHAPES[shape].name}</span>
            </button>
          ))}
        </div>
        <button
          className="clear-shape"
          onClick={() => patch({ shape: null })}
          disabled={!settings.shape}
        >
          <X size={14} /> 清空形状
        </button>
        {rec.needsShape && <p className="microcopy">未选择形状，可手动选择或生成 AI 建议。</p>}
      </Section>
      {photo && (
        <section className="recommendation-box" aria-label="灵感推荐">
          <div className="recommendation-title">
            <Sparkles size={16} />
            <strong>{rec.source === 'builtin' ? '内置灵感' : 'AI 灵感助手'}</strong>
            <span>
              {rec.source === 'builtin'
                ? '精选配色'
                : rec.status === 'ready' && rec.source === 'deepseek'
                  ? 'DEEPSEEK'
                  : 'VISION LLM'}
            </span>
          </div>
          <p>
            {rec.scope.color || rec.scope.shape
              ? `本次建议：${rec.scope.color && rec.scope.shape ? '颜色 + 形状' : rec.scope.color ? '仅颜色' : '仅形状'}`
              : '颜色与形状已选好。清空需要建议的项目后，即可生成建议。'}
          </p>
          {rec.status === 'loading' && (
            <p className="recommendation-loading" role="status">
              <LoaderCircle size={15} className="spin" /> 正在观察画面，寻找合适的搭配…
            </p>
          )}
          {rec.status === 'error' && <p role="status">{rec.error}</p>}
          {rec.status === 'ready' && (
            <>
              <div className="recommendation-list">
                {rec.options.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => editor.applyRecommendation(i)}
                    aria-label={`采用推荐 ${i + 1}`}
                    aria-pressed={rec.selectedIndex === i}
                  >
                    <span
                      className="recommendation-swatch"
                      style={{
                        background: option.color ?? settings.color ?? '#dadbcf',
                        color: '#fff',
                      }}
                    >
                      <ShapeIcon shape={option.shape ?? settings.shape ?? 'circle'} size={21} />
                    </span>
                    <span>
                      <strong>
                        {option.shape ? SHAPES[option.shape].name : '配色'} {option.color}
                      </strong>
                      <small>{option.reason}</small>
                    </span>
                    {rec.selectedIndex === i ? (
                      <span className="recommendation-selected">
                        <Check size={14} />
                        已采用
                      </span>
                    ) : (
                      <ArrowUpRight size={14} />
                    )}
                  </button>
                ))}
              </div>
              <p className="microcopy">
                可反复切换方案，无需再次调用 API。生成前手动选择的设置会保留。
              </p>
            </>
          )}
          <button
            className="recommendation-generate"
            disabled={!rec.canGenerate || recommendationsBusy}
            onClick={() => void rec.generate()}
          >
            <Sparkles size={14} />
            {rec.status === 'loading'
              ? '正在生成…'
              : rec.status === 'error'
                ? '重试 AI 建议'
                : rec.status === 'ready'
                  ? '重新生成 AI 建议'
                  : '生成 AI 建议'}
          </button>
          <p className="microcopy">
            仅点击生成或重试时调用已配置的模型，可能产生 API 费用。编辑和清空不会自动调用。
          </p>
          <div className="inline-actions">
            <button onClick={onConfigure}>配置模型</button>
            <button disabled={!rec.canGenerate || recommendationsBusy} onClick={rec.useBuiltins}>
              使用内置灵感
            </button>
            <button
              disabled={rec.needsColor && rec.needsShape && !paper && !editor.paperLoading}
              title="同时移除上传的色纸，保留底图和布局"
              onClick={() => {
                setHex('');
                editor.clearRecommendationInputs();
              }}
            >
              清空颜色和形状
            </button>
          </div>
          <p className="microcopy">内置灵感无需调用 API。</p>
        </section>
      )}
      <div className="sidebar-footnote">
        <span className="tiny-dot" /> 原图保留，所有裁切均可重新调整。
      </div>
    </aside>
  );
}
