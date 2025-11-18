export type SegmentType = 'literal' | 'expr';

export interface Segment {
  id: string;
  type: SegmentType;
  text: string;
}

export type Doc = Segment[];
export const uid = () => Math.random().toString(36).slice(2, 9);
