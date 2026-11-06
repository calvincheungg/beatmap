import * as THREE from 'three';
import { lonLatToTile, tileOriginInScene, type LonLat, type TileRange } from '../projection';
import type { LayerBuffers, TileBuffers } from '../layers/types';
import type { MapMaterials } from '../materials';
import { theme, type LayerId } from '../../theme';
import { TileWorkerClient } from './tileWorkerClient';

const MAX_IN_FLIGHT = 8;

export interface LoadProgress {
  loaded: number;
  failed: number;
  total: number;
  lastError?: string;
}

/**
 * Loads tiles through the worker and owns the resulting meshes.
 * Each tile becomes a group holding one merged object per layer.
 */
export class TileManager {
  readonly root = new THREE.Group();
  private readonly client: TileWorkerClient;
  private readonly tiles = new Map<string, THREE.Group>();

  constructor(
    url: string,
    private readonly materials: MapMaterials,
    private readonly onChange: (progress: LoadProgress) => void,
  ) {
    this.client = new TileWorkerClient(url);
  }

  /** Loads every tile in a range, nearest to `centre` first. */
  async loadRange(range: TileRange, centre: LonLat): Promise<void> {
    const middle = lonLatToTile(centre, range.z);
    const queue: { x: number; y: number }[] = [];
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) queue.push({ x, y });
    }
    queue.sort(
      (a, b) => Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(b.x - middle.x, b.y - middle.y),
    );

    const progress: LoadProgress = { loaded: 0, failed: 0, total: queue.length };
    const next = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          const buffers = await this.client.load(range.z, item.x, item.y);
          if (buffers) this.addTile(range.z, item.x, item.y, buffers);
          progress.loaded++;
        } catch (error) {
          progress.failed++;
          progress.lastError = String(error);
        }
        this.onChange({ ...progress });
      }
    };
    await Promise.all(Array.from({ length: MAX_IN_FLIGHT }, next));
  }

  unloadTile(key: string): void {
    const group = this.tiles.get(key);
    if (!group) return;
    group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) object.geometry.dispose();
    });
    this.root.remove(group);
    this.tiles.delete(key);
  }

  dispose(): void {
    for (const key of [...this.tiles.keys()]) this.unloadTile(key);
    this.client.dispose();
  }

  private addTile(z: number, x: number, y: number, buffers: TileBuffers): void {
    const group = new THREE.Group();
    const origin = tileOriginInScene(z, x, y);
    group.position.set(origin.x, 0, origin.z);

    for (const id of Object.keys(buffers) as LayerId[]) {
      const layer = buffers[id];
      if (!layer) continue;
      const geometry = toGeometry(layer);
      const object =
        id === 'edges'
          ? new THREE.LineSegments(geometry, this.materials.edges)
          : new THREE.Mesh(geometry, this.materials[id]);
      object.renderOrder = theme.renderOrder[id];
      object.matrixAutoUpdate = false;
      if (id === 'edges') object.visible = this.materials.edgesVisible;
      group.add(object);
    }

    group.updateMatrixWorld(true);
    this.root.add(group);
    this.tiles.set(`${z}/${x}/${y}`, group);
  }

  /** Shows or hides edge lines on every loaded tile. */
  setEdgesVisible(visible: boolean): void {
    if (this.materials.edgesVisible === visible) return;
    this.materials.edgesVisible = visible;
    for (const group of this.tiles.values()) {
      for (const child of group.children) {
        if (child instanceof THREE.LineSegments) child.visible = visible;
      }
    }
  }
}

function toGeometry(layer: LayerBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(layer.position, 3));
  if (layer.normal) geometry.setAttribute('normal', new THREE.BufferAttribute(layer.normal, 3));
  if (layer.color) geometry.setAttribute('color', new THREE.BufferAttribute(layer.color, 3));
  if (layer.index) geometry.setIndex(new THREE.BufferAttribute(layer.index, 1));
  const { x, y, z, radius } = layer.boundingSphere;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), radius);
  return geometry;
}
