import type { ShapeId } from '../../shared/contracts';

const star =
  Array.from({ length: 16 }, (_, index) => {
    const a = (index * Math.PI) / 8 - Math.PI / 2;
    const r = index % 2 === 0 ? 49 : 15;
    return `${index ? 'L' : 'M'} ${Math.cos(a) * r} ${Math.sin(a) * r}`;
  }).join(' ') + ' Z';

// All paths fit a 100×100 box centered at (0, 0). Canvas and SVG share the same mask.
export const SHAPES: Record<ShapeId, { name: string; path: string }> = {
  circle: { name: '圆点', path: 'M 48 0 A 48 48 0 1 1 -48 0 A 48 48 0 1 1 48 0 Z' },
  square: { name: '方块', path: 'M -44 -44 H 44 V 44 H -44 Z' },
  teardrop: {
    name: '水滴',
    path: 'M 0 -49 C -8 -25 -35 0 -35 20 C -35 59 35 59 35 20 C 35 0 8 -25 0 -49 Z',
  },
  starburst: { name: '星芒', path: star },
  cross: {
    name: '十字',
    path: 'M -11 -49 H 11 V -14 H 35 V 7 H 11 V 49 H -11 V 7 H -35 V -14 H -11 Z',
  },
  eye: {
    name: '眼睛',
    path: 'M -49 0 Q 0 -49 49 0 Q 0 49 -49 0 Z M 17 0 A 17 17 0 1 1 -17 0 A 17 17 0 1 1 17 0 Z',
  },
  swallow: {
    name: '燕子',
    // Traced from the supplied side-flying silhouette; the mask contains only the bird.
    path: 'M -7.538 -49.000 C 11.627 -39.928 36.798 -29.451 33.220 -6.069 C 38.587 -5.175 42.548 -3.130 44.592 -0.319 C 41.653 2.619 38.076 4.919 33.220 6.197 C 37.181 23.574 13.927 38.651 -7.538 49.000 C 2.811 34.945 14.055 17.057 12.138 7.091 C 5.622 6.452 0.000 5.814 -5.622 6.197 C -17.249 7.986 -30.282 9.008 -41.909 8.880 C -29.004 7.602 -15.716 5.047 -9.966 2.364 C -14.183 -1.086 -27.726 0.831 -44.592 -2.364 C -25.937 0.703 -5.111 -1.980 11.116 -4.919 C 16.099 -11.819 2.939 -32.645 -7.538 -49.000 Z',
  },
  puzzle: {
    name: '拼图块',
    path: 'M -31 -31 H -11 C -26 -49 26 -49 11 -31 H 31 V -11 C 49 -26 49 26 31 11 V 31 H 11 C 26 49 -26 49 -11 31 H -31 V 11 C -13 26 -13 -26 -31 -11 Z',
  },
};
