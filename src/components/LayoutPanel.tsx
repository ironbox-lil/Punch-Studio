import { Download, LoaderCircle, RotateCcw, Shuffle } from 'lucide-react';
import type { Editor } from '../editor/useEditor';
import { Section, Segmented, Slider, Toggle } from './Primitives';

export function LayoutPanel({ editor }: { editor: Editor }) {
  const { settings: s, patch, scene } = editor;
  return (
    <aside className="layout-panel" aria-label="排列与导出">
      <div className="panel-heading">
        <span>COMPOSITION</span>
        <span>04 — 06</span>
      </div>
      <Section number="04" title="照片上的孔">
        <Segmented
          label="打孔布局"
          value={s.sourceLayout}
          options={[
            { value: 'grid', label: '规则网格' },
            { value: 'random', label: '随机分布' },
          ]}
          onChange={(sourceLayout) => patch({ sourceLayout })}
        />
        {s.sourceLayout === 'grid' ? (
          <div className="two-sliders">
            <Slider
              label="行数"
              value={s.rows}
              min={2}
              max={8}
              onChange={(rows) => patch({ rows })}
            />
            <Slider
              label="列数"
              value={s.columns}
              min={2}
              max={10}
              onChange={(columns) => patch({ columns })}
            />
          </div>
        ) : (
          <Slider
            label="孔的数量"
            value={s.count}
            min={4}
            max={80}
            onChange={(count) => patch({ count })}
          />
        )}
        <Slider
          label="孔的大小"
          value={s.size * 100}
          min={2}
          max={14}
          step={0.5}
          suffix="%"
          onChange={(size) => patch({ size: size / 100 })}
        />
        <div className="field-caption">
          <span>
            共 {scene?.fragments.length ?? s.rows * s.columns} 个孔 ·{' '}
            {s.sourcePositions ? '手动孔位，可重叠' : '自动避免重叠'}
          </span>
        </div>
        {s.sourcePositions && (
          <button className="shuffle-button" onClick={() => patch({ sourcePositions: null })}>
            <RotateCcw size={14} />
            恢复自动孔位
          </button>
        )}
        {s.sourceLayout === 'random' && (
          <button
            className="shuffle-button"
            onClick={() => patch({ sourceSeed: s.sourceSeed + 1 })}
          >
            <Shuffle size={14} /> 换一组孔位
          </button>
        )}
      </Section>
      <Section number="05" title="碎片的新位置">
        <Segmented
          label="碎片布局"
          value={s.fragmentLayout}
          options={[
            { value: 'scatter', label: '自然散落' },
            { value: 'matrix', label: s.composition === 'surround' ? '环绕排列' : '紧凑矩阵' },
          ]}
          onChange={(fragmentLayout) => patch({ fragmentLayout })}
        />
        <Slider
          label="散布范围"
          value={s.spread * 100}
          min={25}
          max={85}
          suffix="%"
          onChange={(spread) => patch({ spread: spread / 100 })}
        />
        <div className="toggle-pair">
          <Toggle label="自由旋转" checked={s.rotate} onChange={(rotate) => patch({ rotate })} />
          <Toggle label="允许重叠" checked={s.overlap} onChange={(overlap) => patch({ overlap })} />
        </div>
        {s.targetPositions && (
          <>
            <p className="microcopy">
              手动碎片可重叠；更改布局、散布范围或重叠设置会恢复自动排列。
            </p>
            <button className="shuffle-button" onClick={() => patch({ targetPositions: null })}>
              <RotateCcw size={14} /> 恢复自动碎片排列
            </button>
          </>
        )}
        <button
          className="shuffle-button"
          onClick={() => patch({ fragmentSeed: s.fragmentSeed + 1 })}
        >
          <Shuffle size={14} /> 换一种碎片排列
        </button>
        <p className="microcopy">可直接拖动色纸上的碎片，照片孔位保持不变。</p>
      </Section>
      <Section number="06" title="带走这幅作品">
        <div className="export-settings" id="export-settings">
          <label className="select-row">
            导出内容
            <select
              aria-label="导出内容"
              value={editor.exportPart}
              onChange={(e) => editor.setExportPart(e.target.value as typeof editor.exportPart)}
            >
              <option value="combined">
                {s.composition === 'surround' ? '完整环绕作品' : '完整双联作品'}
              </option>
              <option value="photo">打孔后的照片</option>
              <option value="paper">
                {s.composition === 'surround' ? '外围色纸与碎片（中间透明）' : '色纸与碎片'}
              </option>
            </select>
          </label>
          <label className="select-row">
            {s.composition === 'surround' ? '照片长边' : '单幅长边'}
            <select
              aria-label="导出分辨率"
              value={editor.exportEdge}
              onChange={(e) => editor.setExportEdge(e.target.value)}
            >
              <option value="1024">1024 px · 轻量</option>
              <option value="2048">2048 px · 高清</option>
              <option value="3072">3072 px · 精细</option>
              <option value="original">原图尺寸（最高 4096）</option>
            </select>
          </label>
          <div className="export-dimensions">
            <span>PNG</span>
            <strong>
              {editor.dimensions
                ? `${editor.dimensions.width} × ${editor.dimensions.height}`
                : '— × —'}
            </strong>
          </div>
          <button
            className="primary-button export-button"
            disabled={!editor.photo || editor.exporting || editor.loading}
            onClick={() => void editor.doExport()}
          >
            {editor.exporting ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Download size={16} />
            )}
            {editor.exporting ? '正在制作高清图片…' : '导出作品'}
            <span>↗</span>
          </button>
        </div>
        {editor.recommendations.needed && editor.photo && (
          <p className="microcopy">尚未选择的项目使用临时蓝色 / 圆点预览，也可直接导出。</p>
        )}
      </Section>
      <div className="layout-footer">
        <div className="mini-punch-pattern">
          ● ● ●<br />● ● ●<br />● ● ●
        </div>
        <p>
          一点缺失，
          <br />
          另一种完整。
        </p>
        <span>
          PUNCH
          <br />
          STUDIO / 01
        </span>
      </div>
    </aside>
  );
}
