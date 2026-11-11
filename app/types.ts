export interface Point2D {
  x: number;
  y: number;
}

export type CellId = 'nav' | 'A' | 'B' | 'C' | 'D' | 'E';

export type InteractionState =
  | 'intro'
  | 'interactive'
  | 'shattering'
  | 'definitions'
  | 'reassembling';

export interface ShardTopology {
  id: CellId;
  points: Point2D[];
}

export interface PhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  avx: number;
  avy: number;
  avz: number;
  hoverZ: number;
  hoverRx: number;
  hoverRy: number;
  targetHoverZ: number;
  targetHoverRx: number;
  targetHoverRy: number;
  iridescence: number;
  envMapIntensity: number;
}
