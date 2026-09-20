import { useEffect, useRef, useState } from 'react';
import { recommendationResponseSchema, type Recommendation } from '../../shared/contracts';
import { imagePreview, type ImageAsset } from '../imaging/assets';
import type { EditorSettings } from '../domain/types';
import { photoCrop } from '../domain/crop';

export interface RecommendationState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  source: 'deepseek' | 'compatible' | 'builtin';
  options: Recommendation[];
  error: string;
  contextKey: string | null;
  scope: { color: boolean; shape: boolean } | null;
  selectedIndex: number | null;
}
const idle: RecommendationState = {
  status: 'idle',
  source: 'deepseek',
  options: [],
  error: '',
  contextKey: null,
  scope: null,
  selectedIndex: null,
};

export function useRecommendations(
  photo: ImageAsset | null,
  paper: ImageAsset | null,
  settings: EditorSettings,
  ratio: number,
  assetsLoading: boolean,
) {
  const [state, setState] = useState(idle);
  const inFlight = useRef<AbortController | null>(null);
  const hasPaper = !!paper && settings.paperMode === 'texture';
  const needsColor = !hasPaper && !settings.color;
  const needsShape = !settings.shape;
  // A batch owns its original recommendation scope. Adoption advances the expected
  // selection, while manual edits or changed material invalidate that same batch.
  const keyFor = (selection: EditorSettings) =>
    JSON.stringify([
      photo?.id,
      paper?.id,
      ratio,
      assetsLoading,
      selection.paperMode,
      selection.color,
      selection.shape,
      selection.crop,
    ]);
  const contextKey = keyFor(settings);
  const active = state.contextKey === contextKey ? state : idle;
  const scope = active.scope ?? { color: needsColor, shape: needsShape };
  const canGenerate = !!photo && !assetsLoading && (scope.color || scope.shape);

  const generate = async () => {
    if (!photo || !canGenerate || inFlight.current) return;
    // Lock synchronously, before React disables the button on the next render.
    const controller = new AbortController();
    inFlight.current = controller;
    const { signal } = controller;
    setState({ ...idle, status: 'loading', contextKey, scope });
    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          image: imagePreview(photo, ratio, photoCrop(photo, settings)),
          ...(hasPaper && paper ? { paperImage: imagePreview(paper, ratio) } : {}),
          ...(!scope.color && !hasPaper && settings.color ? { color: settings.color } : {}),
          ...(!scope.shape && settings.shape ? { shape: settings.shape } : {}),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          typeof body === 'object' && body && 'error' in body && typeof body.error === 'string'
            ? body.error
            : '推荐暂时不可用，请重试。',
        );
      const result = recommendationResponseSchema.parse(body);
      if (
        result.recommendations.some(
          (option) => (scope.color && !option.color) || (scope.shape && !option.shape),
        )
      )
        throw new Error('推荐结果不完整，请重试。');
      if (!signal.aborted)
        setState({
          ...idle,
          status: 'ready',
          source: result.source,
          options: result.recommendations,
          contextKey,
          scope,
        });
    } catch (error) {
      if (!signal.aborted)
        setState({
          ...idle,
          status: 'error',
          error: error instanceof Error ? error.message : '推荐失败，请重试。',
          contextKey,
          scope,
        });
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  };

  useEffect(() => {
    if (state.contextKey !== null && state.contextKey !== contextKey) {
      inFlight.current?.abort();
      inFlight.current = null;
      setState(idle);
    }
  }, [contextKey, state.contextKey]);

  useEffect(
    () => () => {
      inFlight.current?.abort();
      inFlight.current = null;
    },
    [],
  );

  const adopt = (index: number): Partial<EditorSettings> | null => {
    const option = active.options[index];
    if (active.status !== 'ready' || !option || assetsLoading) return null;
    const changes: Partial<EditorSettings> = {
      ...(scope.shape && option.shape ? { shape: option.shape } : {}),
      ...(scope.color && option.color ? { color: option.color, paperMode: 'color' } : {}),
    };
    setState({
      ...active,
      selectedIndex: index,
      contextKey: keyFor({ ...settings, ...changes }),
    });
    return changes;
  };

  const useBuiltins = () => {
    if (!canGenerate || inFlight.current) return;
    setState({
      ...idle,
      status: 'ready',
      source: 'builtin',
      contextKey,
      scope,
      options: [
        {
          color: '#193BCB',
          shape: 'starburst' as const,
          reason: '浓蓝色纸与尖锐星芒，突出明暗与节奏。',
        },
        {
          color: '#8A242C',
          shape: 'circle' as const,
          reason: '酒红色纸搭配圆点，让细节像被收集的标本。',
        },
        {
          color: '#DCE5B4',
          shape: 'swallow' as const,
          reason: '浅绿色纸与燕子轮廓，让照片碎片轻盈散开。',
        },
      ].map((option) => ({
        reason: option.reason,
        ...(scope.color ? { color: option.color } : {}),
        ...(scope.shape ? { shape: option.shape } : {}),
      })),
    });
  };
  const onConfigChange = () => {
    inFlight.current?.abort();
    inFlight.current = null;
    // Completed candidates remain useful for comparison; only an in-flight request is obsolete.
    setState((current) => (current.status === 'loading' ? idle : current));
  };
  return {
    ...active,
    scope,
    needed: needsColor || needsShape,
    canGenerate,
    needsColor,
    needsShape,
    generate,
    adopt,
    useBuiltins,
    onConfigChange,
  };
}
