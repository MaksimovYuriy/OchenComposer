type Asset = {
  id: string; name: string; role: 'main' | 'background'; size: 'large' | 'small';
  source: string; width: number; height: number; svg: string;
  rotationAngles?: number[];
};
type Placement = { asset: Asset; x: number; y: number; scale: number };
type Backdrop = { size: 'large' | 'small'; svg: string; width: number; height: number };
type Matrix = [[number, number, number], [number, number, number]];
type Bounds = { x: number; y: number; width: number; height: number };
type ScenePlacement = Placement & { role: 'main' | 'support' | 'background'; order: number;
  rotation: number; pivot: { x: number; y: number }; transform: Matrix; bounds: Bounds };
type StateMode = 'color' | 'mixed' | 'mono';
type TemplateId = 'diagonal' | 'focus' | 'terrace';
type CompositionQuality = { version: 'composition-v2'; score: number; density: number; balance: number; minSide: number; candidates: number; strategy: string; warnings: string[] };
type ScenePlan = { template: TemplateId; seed: number; placements: ScenePlacement[]; quality?: CompositionQuality };
type Zone = { x: number; y: number; w: number; h: number };

