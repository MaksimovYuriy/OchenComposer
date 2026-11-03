function rotatedSize(width: number, height: number, angle: number): { width: number; height: number } {
  const radians = angle * Math.PI / 180;
  const c = Math.abs(Math.cos(radians)), s = Math.abs(Math.sin(radians));
  return { width: c * width + s * height, height: s * width + c * height };
}

function centeredTransform(width: number, height: number, angle: number, cx: number, cy: number): Matrix {
  const radians = angle * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  return [[c, -s, cx - c * width / 2 + s * height / 2], [s, c, cy - s * width / 2 - c * height / 2]];
}

function stateReplacementScale(source: Asset, target: Asset, width: number, height: number): number {
  if (source.id !== target.id || source.size !== target.size || source.width !== target.width || source.height !== target.height) {
    throw new Error('Варианты предмета не имеют подтверждённого общего размера.');
  }
  const scale = width / source.width;
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(height - source.height * scale) > Math.max(.1, height * .001)) {
    throw new Error('Предмет растянут по осям. Восстановите его пропорции перед переключением.');
  }
  return scale;
}

