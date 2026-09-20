import { panelSize } from './ratios';
import type { Rect, Scene, Size } from './types';

/** Pixel geometry shared by drawing, export dimensions and interactive hole coordinates. */
export function compositionGeometry(scene: Scene, longEdge: number, paperFirst: boolean) {
  const panel = panelSize(scene.frame.width, longEdge);
  let combined: Size, photo: Rect, paper: Rect;
  if (scene.orientation === 'surround') {
    const border = Math.max(1, Math.round(scene.border * panel.height));
    combined = { width: panel.width + 2 * border, height: panel.height + 2 * border };
    photo = { x: border, y: border, ...panel };
    paper = { x: 0, y: 0, ...combined };
  } else {
    const horizontal = scene.orientation === 'horizontal';
    combined = {
      width: panel.width * (horizontal ? 2 : 1),
      height: panel.height * (horizontal ? 1 : 2),
    };
    const offset = { x: horizontal ? panel.width : 0, y: horizontal ? 0 : panel.height };
    photo = { ...panel, ...(paperFirst ? offset : { x: 0, y: 0 }) };
    paper = { ...panel, ...(paperFirst ? { x: 0, y: 0 } : offset) };
  }
  return { panel, combined, photo, paper };
}
