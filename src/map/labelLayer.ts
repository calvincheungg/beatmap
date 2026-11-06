import * as THREE from 'three';
import { theme } from '../theme';
import type { TileLabel } from './layers/types';

function toCssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** A label with a position on the ground, in scene units. */
export interface PlacedLabel extends TileLabel {
  worldX: number;
  worldZ: number;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Draws place names on a 2D canvas above the map, skipping any that would overlap. */
export class LabelLayer {
  private readonly context: CanvasRenderingContext2D;
  private readonly point = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
  }

  draw(labels: PlacedLabel[], camera: THREE.Camera, width: number, height: number, pixelRatio: number): void {
    const { context, canvas } = this;
    const { labels: style } = theme;
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.lineWidth = style.outlineWidth;
    context.strokeStyle = toCssColor(style.outline);
    context.fillStyle = toCssColor(style.fill);

    const taken: Box[] = [];
    const seen = new Set<string>();
    const ordered = [...labels].sort((a, b) => a.priority - b.priority);

    for (const label of ordered) {
      if (taken.length >= style.maxPerFrame) break;
      if (seen.has(label.name)) continue;

      this.point.set(label.worldX, 0, label.worldZ).project(camera);
      const x = ((this.point.x + 1) / 2) * width;
      const y = ((1 - this.point.y) / 2) * height;
      if (x < 0 || x > width || y < 0 || y > height) continue;

      const size = label.isLocality ? style.localitySize : style.neighbourhoodSize;
      context.font = `${size}px ${style.fontFamily}`;
      const text = label.name.toUpperCase();
      const halfWidth = context.measureText(text).width / 2 + style.padding;
      const halfHeight = size / 2 + style.padding;
      const box = { left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight };
      if (taken.some((other) => overlaps(box, other))) continue;

      taken.push(box);
      seen.add(label.name);
      context.strokeText(text, x, y);
      context.fillText(text, x, y);
    }
  }
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
