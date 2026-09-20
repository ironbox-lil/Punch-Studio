import { useRef, useState } from 'react';
import { ArrowUpRight, HelpCircle, Scissors, Settings2, X } from 'lucide-react';
import { useEditor } from './editor/useEditor';
import { MaterialPanel } from './components/MaterialPanel';
import { LayoutPanel } from './components/LayoutPanel';
import { Workbench } from './components/Workbench';
import { LlmConfigDialog } from './components/LlmConfigDialog';

export default function App() {
  const editor = useEditor();
  const help = useRef<HTMLDialogElement>(null);
  const [configOpen, setConfigOpen] = useState(false);
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="赛博打孔器首页">
          <span className="brand-mark">
            <Scissors size={23} strokeWidth={1.8} />
          </span>
          <span>
            <strong>
              赛博打孔器<span className="brand-period">®</span>
            </strong>
            <small>PUNCH STUDIO</small>
          </span>
        </a>
        <div className="header-center">
          <span className="tiny-dot" /> 数字拼贴实验室
        </div>
        <div className="header-actions">
          <button onClick={() => setConfigOpen(true)}>
            <Settings2 size={15} /> LLM 配置
          </button>
          <button onClick={() => help.current?.showModal()}>
            <HelpCircle size={15} /> 使用指南
          </button>
          <span className="version-tag">VOL. 01</span>
        </div>
      </header>
      <main>
        <div className="intro-row">
          <div>
            <span className="eyebrow">A SMALL CUT, A NEW COMPOSITION.</span>
            <h1>
              剪下一点，<span>重组想象。</span>
            </h1>
          </div>
          <p>
            一张照片，一张色纸。
            <br />
            让每一块碎片，都找到新的位置。
            <ArrowUpRight size={25} strokeWidth={1.3} />
          </p>
        </div>
        {editor.error && (
          <div className="toast-error" role="alert">
            <span>{editor.error}</span>
            <button aria-label="关闭提示" onClick={() => editor.setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="studio-grid">
          <MaterialPanel editor={editor} onConfigure={() => setConfigOpen(true)} />
          <Workbench editor={editor} />
          <LayoutPanel editor={editor} />
        </div>
      </main>
      <footer className="app-footer">
        <span>PUNCH STUDIO — MAKE SOMETHING UNEXPECTED.</span>
        <span>照片在本地处理 · AI 推荐时仅发送压缩预览</span>
      </footer>
      {configOpen && (
        <LlmConfigDialog
          onClose={() => setConfigOpen(false)}
          onSaved={editor.recommendations.onConfigChange}
        />
      )}
      <dialog ref={help} className="help-dialog">
        <div className="dialog-heading">
          <h2>三步，完成一次图像交换</h2>
          <button
            className="icon-button"
            aria-label="关闭使用指南"
            onClick={() => help.current?.close()}
          >
            <X size={19} />
          </button>
        </div>
        <ol>
          <li>
            <strong>放入底图</strong>
            <p>
              上传照片或选择样片，默认按最接近的比例居中裁切。点击“自由裁剪底图”，可拖动选区、调整边角和缩放，也能锁定比例；点击“应用裁剪”后生效，原图会保留。
            </p>
          </li>
          <li>
            <strong>选择色纸和形状</strong>
            <p>
              使用纯色或上传纹理图片，颜色和形状都可以清空。需要建议时，点击“生成 AI 建议”，让
              已配置的视觉模型补齐空缺，再点击候选采用。右上角“LLM
              配置”可填写自己的模型和密钥，只有主动生成建议才会调用 API。
            </p>
          </li>
          <li>
            <strong>调整排列，导出作品</strong>
            <p>
              照片上的孔和色纸上的碎片都可独立拖动，也可用方向键微调，拖动中按 Esc
              取消。两侧都可恢复自动排列。
              选择“外围色纸”，即可在照片四周扩展纯色区域并排列碎片，宽度可调。PNG
              导出与画布构图一致，可单独导出照片或色纸。
            </p>
          </li>
        </ol>
        <p className="help-note">
          原图不会修改。图片和编辑状态仅保留在当前页面，刷新页面会重置。推荐服务不可用时，可以继续手动制作。
        </p>
        <button className="primary-button" onClick={() => help.current?.close()}>
          开始创作 <ArrowUpRight size={16} />
        </button>
      </dialog>
    </div>
  );
}
