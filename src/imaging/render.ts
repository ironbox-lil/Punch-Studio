import { SHAPES } from '../domain/shapes';
import { photoCrop } from '../domain/crop';
import { compositionGeometry } from '../domain/composition';
import type { EditorSettings, Scene, Size } from '../domain/types';
import { canvas, context, drawCover, type ImageAsset } from './assets';

export interface RenderResult {
  photo: HTMLCanvasElement;
  paper: HTMLCanvasElement;
  combined: HTMLCanvasElement;
}

export function exportSize(
  scene: Scene,
  longEdge: number,
  part: keyof RenderResult = 'combined',
): Size {
  const geometry = compositionGeometry(scene, longEdge, true);
  const size = part === 'photo' ? geometry.panel : geometry[part];
  return { width: size.width, height: size.height };
}

export function renderArtwork(
  photo: ImageAsset,
  paper: ImageAsset | null,
  settings: EditorSettings,
  scene: Scene,
  longEdge: number,
): RenderResult {
  const geometry = compositionGeometry(scene, longEdge, settings.paperFirst);
  const dimensions = geometry.panel;
  const surround = scene.orientation === 'surround';
  const originalPhoto = canvas(dimensions);
  drawCover(context(originalPhoto), photo, dimensions, photoCrop(photo, settings));
  // Surround paper is uniform, so its immutable source needs only one pixel.
  const originalPaper = canvas(surround ? { width: 1, height: 1 } : geometry.paper);
  const paperBase = context(originalPaper);
  paperBase.fillStyle = settings.color ?? '#183DCD';
  paperBase.fillRect(0, 0, originalPaper.width, originalPaper.height);
  if (!surround && paper && settings.paperMode === 'texture')
    drawCover(paperBase, paper, dimensions);
  const photoOut = canvas(dimensions),
    paperOut = canvas(geometry.paper);
  const photoCtx = context(photoOut),
    paperCtx = context(paperOut);
  photoCtx.drawImage(originalPhoto, 0, 0);
  if (surround) {
    paperCtx.fillStyle = paperBase.fillStyle;
    paperCtx.fillRect(0, 0, paperOut.width, paperOut.height);
  } else paperCtx.drawImage(originalPaper, 0, 0);
  const path = new Path2D(SHAPES[settings.shape ?? 'circle'].path);
  const scale = dimensions.height;
  const diameter = scene.size * scale;
  for (const fragment of scene.fragments) {
    const sx = fragment.source.x * scale,
      sy = fragment.source.y * scale;
    const tx = fragment.target.x * scale,
      ty = fragment.target.y * scale;
    // Cut only the mask's solid part. In particular, the eye's center stays untouched.
    photoCtx.save();
    photoCtx.translate(sx, sy);
    photoCtx.scale(diameter / 100, diameter / 100);
    photoCtx.clip(path, 'evenodd');
    photoCtx.setTransform(1, 0, 0, 1, sx, sy);
    if (surround) {
      photoCtx.fillStyle = paperBase.fillStyle;
      photoCtx.fillRect(-diameter, -diameter, diameter * 2, diameter * 2);
    } else {
      photoCtx.rotate(-fragment.rotation);
      photoCtx.drawImage(originalPaper, -tx, -ty);
    }
    photoCtx.restore();

    paperCtx.save();
    paperCtx.translate(tx, ty);
    paperCtx.rotate(fragment.rotation);
    paperCtx.scale(diameter / 100, diameter / 100);
    paperCtx.clip(path, 'evenodd');
    paperCtx.setTransform(1, 0, 0, 1, tx, ty);
    paperCtx.rotate(fragment.rotation);
    paperCtx.drawImage(originalPhoto, -sx, -sy);
    paperCtx.restore();
  }
  const combined = canvas(exportSize(scene, longEdge));
  const combinedCtx = context(combined);
  if (surround)
    paperCtx.clearRect(geometry.photo.x, geometry.photo.y, dimensions.width, dimensions.height);
  combinedCtx.drawImage(paperOut, geometry.paper.x, geometry.paper.y);
  combinedCtx.drawImage(photoOut, geometry.photo.x, geometry.photo.y);
  // Release intermediate canvases promptly; exports can contain millions of pixels.
  originalPhoto.width = 0;
  originalPaper.width = 0;
  return { photo: photoOut, paper: paperOut, combined };
}

export function releaseRender(result: RenderResult) {
  result.photo.width = 0;
  result.paper.width = 0;
  result.combined.width = 0;
}

export async function downloadPng(element: HTMLCanvasElement, name: string): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    element.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('导出失败，请降低分辨率重试。'))),
      'image/png',
    ),
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
