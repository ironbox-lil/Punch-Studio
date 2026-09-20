import type { ShapeId } from '../../shared/contracts';

export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point, Size {}
// Fractions of the EXIF-oriented original image, never of a resized preview.
export type PhotoCrop = Rect;
export type Composition = 'auto' | 'vertical' | 'horizontal' | 'surround';
export type PieceSide = 'source' | 'target';
export interface EditorSettings {
  ratio: string;
  crop: PhotoCrop | null;
  shape: ShapeId | null;
  color: string | null;
  paperMode: 'texture' | 'color';
  sourceLayout: 'grid' | 'random';
  rows: number;
  columns: number;
  count: number;
  size: number;
  fragmentLayout: 'scatter' | 'matrix';
  spread: number;
  rotate: boolean;
  overlap: boolean;
  sourceSeed: number;
  // Manual centers as fractions of the cropped photo width/height, indexed by fragment.
  sourcePositions: Point[] | null;
  // Manual centers as fractions of the entire paper width/height, indexed by fragment.
  targetPositions: Point[] | null;
  fragmentSeed: number;
  composition: Composition;
  borderWidth: number;
  paperFirst: boolean;
}
export const DEFAULT_SETTINGS: EditorSettings = {
  ratio: 'auto',
  crop: null,
  shape: null,
  color: null,
  paperMode: 'texture',
  sourceLayout: 'grid',
  rows: 4,
  columns: 4,
  count: 16,
  size: 0.065,
  fragmentLayout: 'scatter',
  spread: 0.5,
  rotate: true,
  overlap: true,
  sourceSeed: 1001,
  sourcePositions: null,
  targetPositions: null,
  fragmentSeed: 2026,
  composition: 'auto',
  borderWidth: 0.28,
  paperFirst: true,
};
export interface Fragment {
  source: Point;
  target: Point;
  rotation: number;
}
export interface Scene {
  frame: Size;
  ratioLabel: string;
  size: number;
  fragments: Fragment[];
  orientation: Exclude<Composition, 'auto'>;
  border: number;
  notices: string[];
}
