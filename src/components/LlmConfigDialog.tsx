import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import {
  publicLlmConfigSchema,
  saveLlmConfigSchema,
  type LlmFields,
  type PublicLlmConfig,
} from '../../shared/llm-config';

async function readResponse(response: Response): Promise<PublicLlmConfig> {
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : '配置暂时不可用，请重新打开窗口。',
    );
  return publicLlmConfigSchema.parse(body);
}

export function LlmConfigDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [saved, setSaved] = useState<PublicLlmConfig | null>(null);
  const [draft, setDraft] = useState<LlmFields>({
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
  });
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    request.current = controller;
    fetch('/api/llm-config', { signal: controller.signal })
      .then(readResponse)
      .then((config) => {
        if (!controller.signal.aborted) {
          setSaved(config);
          setDraft({ provider: config.provider, baseUrl: config.baseUrl, model: config.model });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('无法读取配置，请确认服务在本机运行后重新打开。');
      })
      .finally(() => {
        if (request.current === controller) request.current = null;
      });
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, []);

  const save = async (clear = false) => {
    if (!saved || request.current || busy) return;
    setError('');
    setMessage('');
    const parsed = saveLlmConfigSchema.safeParse({
      ...(clear ? { provider: saved.provider, baseUrl: saved.baseUrl, model: saved.model } : draft),
      revision: saved.revision,
      keyAction: clear ? 'clear' : apiKey.trim() ? 'replace' : 'keep',
      ...(!clear && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    });
    if (!parsed.success) {
      setError('请检查 API 根地址、模型名和密钥。远程地址须使用 HTTPS，本机服务可使用 HTTP。');
      return;
    }
    if (!clear && saved.configured && parsed.data.baseUrl !== saved.baseUrl && !apiKey.trim()) {
      setError('更换 API 地址时，请重新填写对应服务的 API Key。');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const config = await readResponse(
        await fetch('/api/llm-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
          signal: controller.signal,
        }),
      );
      if (!controller.signal.aborted) {
        setSaved(config);
        setDraft({ provider: config.provider, baseUrl: config.baseUrl, model: config.model });
        setApiKey('');
        setMessage(
          clear
            ? '密钥已清除。手动制作和内置灵感仍可使用。'
            : '配置已保存，下次手动生成 AI 建议时生效。',
        );
        onSaved();
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };
  return (
    <dialog
      ref={dialog}
      className="help-dialog llm-dialog"
      aria-labelledby="llm-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="dialog-heading">
        <h2 id="llm-title">LLM 配置</h2>
        <button
          className="icon-button"
          aria-label="关闭 LLM 配置"
          disabled={busy}
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <p className="microcopy">
        选择支持图像输入的模型，用于推荐配色与打孔形状。保存配置不会调用模型。
      </p>
      {!saved && !error && (
        <p role="status">
          <LoaderCircle className="spin" size={16} /> 正在读取配置…
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={!saved || busy} className="llm-fields">
          <label>
            服务类型
            <select
              value={draft.provider}
              onChange={(event) => {
                const provider = event.target.value as LlmFields['provider'];
                setDraft(
                  provider === 'deepseek'
                    ? { provider, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' }
                    : { provider, baseUrl: '', model: '' },
                );
                setApiKey('');
                setMessage('');
              }}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="compatible">OpenAI 兼容服务</option>
            </select>
          </label>
          <label>
            API 根地址
            <input
              type="url"
              required
              value={draft.baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(e) => {
                setDraft({ ...draft, baseUrl: e.target.value });
                setMessage('');
              }}
              spellCheck={false}
              autoCapitalize="none"
            />
          </label>
          <p className="microcopy">
            程序会在根地址后追加 /chat/completions。兼容服务需支持 image_url 图像输入与 JSON 输出。
          </p>
          <label>
            模型名称
            <input
              required
              value={draft.model}
              maxLength={160}
              placeholder="填写服务提供方的视觉模型 ID"
              onChange={(e) => {
                setDraft({ ...draft, model: e.target.value });
                setMessage('');
              }}
              spellCheck={false}
              autoCapitalize="none"
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={apiKey}
              maxLength={512}
              autoComplete="new-password"
              spellCheck={false}
              autoCapitalize="none"
              placeholder={saved?.configured ? '已配置；留空保留现有密钥' : '填写自己的 API Key'}
              onChange={(e) => {
                setApiKey(e.target.value);
                setMessage('');
              }}
            />
          </label>
          <p className="microcopy">
            {saved?.configured
              ? '已有密钥，出于保护不会回显。'
              : '未配置密钥，可先使用手动制作与内置灵感。'}
          </p>
          <div className="llm-actions">
            <button
              type="button"
              className="shuffle-button"
              disabled={!saved?.configured}
              onClick={() => void save(true)}
            >
              清除已保存密钥
            </button>
            <button type="submit" className="primary-button">
              {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{' '}
              {busy ? '保存中…' : '保存配置'}
            </button>
          </div>
        </fieldset>
      </form>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="llm-success" role="status">
          {message}
        </p>
      )}
      <p className="help-note">
        配置保存在运行服务的电脑上，仅本机可修改。密钥不会写入浏览器存储，也不会随源码上传
        GitHub。仅主动生成或重试建议时使用配置，可能产生模型 API 费用。
      </p>
    </dialog>
  );
}
