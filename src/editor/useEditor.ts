import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type Composition,
  type EditorSettings,
  type Point,
  type PieceSide,
} from '../domain/types';
import { createScene } from '../domain/layout';
import { photoCrop } from '../domain/crop';
import { moveHole } from '../domain/holes';
import { moveFragment } from '../domain/fragments';
import { dominantColor, loadAsset, type ImageAsset } from '../imaging/assets';
import { downloadPng, exportSize, releaseRender, renderArtwork } from '../imaging/render';
import type { Sample } from '../../shared/contracts';
import { useRecommendations } from './useRecommendations';

export function useEditor() {
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);
  const [photo, setPhoto] = useState<ImageAsset | null>(null);
  const [paper, setPaper] = useState<ImageAsset | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(false);
  const [paperLoading, setPaperLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportEdge, setExportEdge] = useState('2048');
  const [exportPart, setExportPart] = useState<'combined' | 'photo' | 'paper'>('combined');
  const versions = useRef({ photo: 0, paper: 0 });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const currentVersions = versions.current;
    return () => {
      mounted.current = false;
      currentVersions.photo++;
      currentVersions.paper++;
    };
  }, []);
  useEffect(() => () => photo?.bitmap.close(), [photo]);
  useEffect(() => () => paper?.bitmap.close(), [paper]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/samples', { signal: controller.signal })
      .then((r) => r.json())
      .then((data: Sample[]) => {
        if (!controller.signal.aborted && Array.isArray(data)) setSamples(data);
      })
      .catch(() => {
        /* Local samples are optional; uploads remain available. */
      });
    return () => controller.abort();
  }, []);

  const patch = useCallback(
    (values: Partial<EditorSettings>) =>
      setSettings((current) => {
        const next = { ...current, ...values };
        const changed = (keys: (keyof EditorSettings)[]) =>
          keys.some((key) => next[key] !== current[key]);
        const count = (s: EditorSettings) =>
          s.sourceLayout === 'grid' ? s.rows * s.columns : s.count;
        return {
          ...current,
          ...(changed(['sourceLayout', 'rows', 'columns', 'count', 'sourceSeed'])
            ? { sourcePositions: null }
            : {}),
          ...(count(next) !== count(current) ||
          changed(['fragmentLayout', 'spread', 'overlap', 'fragmentSeed'])
            ? { targetPositions: null }
            : {}),
          ...values,
        };
      }),
    [],
  );

  const upload = async (input: File | Sample, target: 'photo' | 'paper') => {
    const version = ++versions.current[target];
    const setBusy = target === 'photo' ? setLoading : setPaperLoading;
    setBusy(true);
    setError('');
    try {
      let blob: Blob;
      if (input instanceof File) blob = input;
      else {
        const response = await fetch(input.url);
        if (!response.ok) throw new Error('样片载入失败，请重试。');
        blob = await response.blob();
      }
      const asset = await loadAsset(blob, input.name);
      if (!mounted.current || version !== versions.current[target]) {
        asset.bitmap.close();
        return;
      }
      if (target === 'photo') {
        setPhoto(asset);
        patch({ crop: null, sourcePositions: null, targetPositions: null });
      } else {
        setPaper(asset);
        setSettings((current) => ({
          ...current,
          ...(current.composition === 'surround'
            ? { paperMode: 'color', color: dominantColor(asset) }
            : { paperMode: 'texture', color: null }),
        }));
      }
    } catch (cause) {
      if (mounted.current && version === versions.current[target])
        setError(cause instanceof Error ? cause.message : '图片载入失败。');
    } finally {
      if (mounted.current && version === versions.current[target]) setBusy(false);
    }
  };

  const scene = useMemo(() => (photo ? createScene(photo, settings) : null), [photo, settings]);
  const movePiece = (side: PieceSide, index: number, point: Point) => {
    if (!photo) return;
    setSettings((current) => {
      const move = side === 'source' ? moveHole : moveFragment;
      const positions = move(createScene(photo, current), index, point);
      return positions
        ? { ...current, [side === 'source' ? 'sourcePositions' : 'targetPositions']: positions }
        : current;
    });
  };
  const setComposition = (composition: Composition) => {
    setSettings((current) => ({
      ...current,
      composition,
      ...(composition === 'surround'
        ? {
            paperMode: 'color',
            color: current.color ?? (paper ? dominantColor(paper) : null),
          }
        : {}),
    }));
  };
  const recommendations = useRecommendations(
    photo,
    paper,
    settings,
    scene?.frame.width ?? 1,
    loading || paperLoading,
  );
  const applyRecommendation = (index: number) => {
    const changes = recommendations.adopt(index);
    if (changes) setSettings((current) => ({ ...current, ...changes }));
  };
  const clearPaper = () => {
    versions.current.paper++;
    setPaperLoading(false);
    setPaper(null);
  };
  const setColor = (color: string | null) => {
    if (!color) clearPaper();
    patch({ color, paperMode: 'color' });
  };
  const clearRecommendationInputs = () => {
    clearPaper();
    patch({ color: null, shape: null, paperMode: 'color' });
  };
  const setPaperMode = (mode: 'texture' | 'color') =>
    patch({ paperMode: mode, color: mode === 'color' && paper ? dominantColor(paper) : null });
  const nativeCrop = photo ? photoCrop(photo, settings) : null;
  const nativeEdge = nativeCrop ? Math.floor(Math.max(nativeCrop.width, nativeCrop.height)) : 2048;
  const edge = Math.min(exportEdge === 'original' ? nativeEdge : Number(exportEdge), 4096);
  const dimensions = scene ? exportSize(scene, edge, exportPart) : null;
  const doExport = async () => {
    if (!photo || !scene || exporting) return;
    setExporting(true);
    setError('');
    let result: ReturnType<typeof renderArtwork> | undefined;
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      result = renderArtwork(photo, paper, settings, scene, edge);
      await downloadPng(
        result[exportPart],
        `punch-${exportPart}-${scene.ratioLabel.replace(':', 'x')}-${Date.now()}.png`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败，请降低分辨率。');
    } finally {
      if (result) releaseRender(result);
      setExporting(false);
    }
  };
  return {
    settings,
    patch,
    movePiece,
    setComposition,
    photo,
    paper,
    samples,
    loading,
    paperLoading,
    error,
    setError,
    upload,
    scene,
    recommendations,
    applyRecommendation,
    setColor,
    clearRecommendationInputs,
    setPaperMode,
    exportEdge,
    setExportEdge,
    exportPart,
    setExportPart,
    dimensions,
    exporting,
    doExport,
  };
}
export type Editor = ReturnType<typeof useEditor>;
