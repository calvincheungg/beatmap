import * as THREE from 'three';
import { selectBand } from '../layers/lod';
import type { LayerBuffers, TileBuffers, TileLabel } from '../layers/types';
import type { MapMaterials } from '../materials';
import type { PlacedLabel } from '../labelLayer';
import { boundsToScene, tileOriginInScene, tileRangeForBounds, type LonLatBounds, type SceneBounds } from '../projection';
import { theme, type LayerId } from '../../theme';
import { TileWorkerClient } from './tileWorkerClient';
import { tileKey, visibleTiles, type TileCoord, type TileView } from './visibleTiles';

const WORKER_COUNT = 2;
const MAX_IN_FLIGHT = 8;
/** Geometry uploads are the main source of hitches, so spread them across frames. */
const MAX_UPLOADS_PER_FRAME = 2;
/** Hidden tiles stay in memory up to this total, so panning back is instant. */
const MAX_CACHED_TILES = 200;

export interface LoadProgress {
  loaded: number;
  failed: number;
  total: number;
  lastError?: string;
}

interface LoadedTile {
  coord: TileCoord;
  group: THREE.Group;
  labels: PlacedLabel[];
  lastWanted: number;
}

/**
 * Keeps the visible tiles loaded and owns their meshes. Each tile is one group
 * holding one merged object per layer. When the zoom band changes, the old
 * band's tiles stay on screen until the new ones are ready, so the map never blanks.
 */
export class TileManager {
  readonly root = new THREE.Group();
  private readonly workers: TileWorkerClient[];
  private readonly tiles = new Map<string, LoadedTile>();
  /** Tiles the archive has nothing for. */
  private readonly empty = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly inFlight = new Set<string>();
  /** Finished in the worker, waiting to be uploaded to the GPU. */
  private readonly ready: { coord: TileCoord; buffers: TileBuffers }[] = [];

  private wanted: TileCoord[] = [];
  private wantedKeys = new Set<string>();
  private wantedZoom = -1;
  private queue: TileCoord[] = [];
  private lastViewKey = '';
  private generation = 0;
  private nextWorker = 0;
  private lastError: string | undefined;
  private readonly sceneBounds: SceneBounds;

  constructor(
    url: string,
    private readonly materials: MapMaterials,
    private readonly bounds: LonLatBounds,
    private readonly onProgress: (progress: LoadProgress) => void,
  ) {
    this.sceneBounds = boundsToScene(bounds);
    this.workers = Array.from({ length: WORKER_COUNT }, () => new TileWorkerClient(url));
  }

  /** Call once per rendered frame. Returns true if more work is waiting for another frame. */
  update(view: TileView, bandViewHeight: number): boolean {
    this.refreshWanted(view, bandViewHeight);
    this.startLoads();

    let added = false;
    for (let i = 0; i < MAX_UPLOADS_PER_FRAME && this.ready.length > 0; i++) {
      const { coord, buffers } = this.ready.shift()!;
      this.addTile(coord, buffers);
      added = true;
    }
    if (added) this.refreshVisibility();

    return this.ready.length > 0;
  }

  /** Place names on the tiles the current band wants. */
  get visibleLabels(): PlacedLabel[] {
    const labels: PlacedLabel[] = [];
    for (const key of this.wantedKeys) {
      const tile = this.tiles.get(key);
      if (tile) labels.push(...tile.labels);
    }
    return labels;
  }

  unloadTile(key: string): void {
    const tile = this.tiles.get(key);
    if (!tile) return;
    tile.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) object.geometry.dispose();
    });
    this.root.remove(tile.group);
    this.tiles.delete(key);
  }

  dispose(): void {
    for (const key of [...this.tiles.keys()]) this.unloadTile(key);
    for (const worker of this.workers) worker.dispose();
  }

  private refreshWanted(view: TileView, bandViewHeight: number): void {
    const band = selectBand(bandViewHeight);
    const viewKey = [
      band.tileZoom,
      Math.round(view.target.x / 10),
      Math.round(view.target.z / 10),
      Math.round(view.viewHeight / 10),
      view.aspect.toFixed(3),
      view.azimuth.toFixed(3),
      view.elevation.toFixed(3),
    ].join();
    if (viewKey === this.lastViewKey) return;
    this.lastViewKey = viewKey;

    const limits = tileRangeForBounds(this.bounds, band.tileZoom);
    this.wanted = visibleTiles(view, limits, theme.tallestBuildingMargin);
    this.wantedKeys = new Set(this.wanted.map(tileKey));
    this.wantedZoom = band.tileZoom;
    this.queue = this.wanted.filter((coord) => this.needsLoad(tileKey(coord)));
    this.generation++;

    for (const key of this.wantedKeys) {
      const tile = this.tiles.get(key);
      if (tile) tile.lastWanted = this.generation;
    }
    this.refreshVisibility();
  }

  private needsLoad(key: string): boolean {
    return (
      !this.tiles.has(key) &&
      !this.empty.has(key) &&
      !this.failed.has(key) &&
      !this.inFlight.has(key) &&
      !this.ready.some((item) => tileKey(item.coord) === key)
    );
  }

  private startLoads(): void {
    while (this.inFlight.size < MAX_IN_FLIGHT && this.queue.length > 0) {
      const coord = this.queue.shift()!;
      const key = tileKey(coord);
      if (!this.needsLoad(key)) continue;

      this.inFlight.add(key);
      const worker = this.workers[this.nextWorker++ % this.workers.length]!;
      worker
        .load(coord.z, coord.x, coord.y)
        .then((buffers) => {
          if (buffers) this.ready.push({ coord, buffers });
          else this.empty.add(key);
        })
        .catch((error: unknown) => {
          this.failed.add(key);
          this.lastError = String(error);
        })
        .finally(() => {
          this.inFlight.delete(key);
          this.emitProgress();
        });
    }
  }

  private emitProgress(): void {
    let loaded = 0;
    let failed = 0;
    for (const key of this.wantedKeys) {
      if (this.failed.has(key)) failed++;
      else if (this.tiles.has(key) || this.empty.has(key) || this.ready.some((item) => tileKey(item.coord) === key)) {
        loaded++;
      }
    }
    this.onProgress({ loaded, failed, total: this.wanted.length, lastError: this.lastError });
  }

  /** Shows wanted tiles, keeps the previous band up until they're ready, and evicts the oldest hidden tiles. */
  private refreshVisibility(): void {
    const allReady = this.wanted.every((coord) => {
      const key = tileKey(coord);
      return this.tiles.has(key) || this.empty.has(key) || this.failed.has(key);
    });

    for (const [key, tile] of this.tiles) {
      const isWanted = this.wantedKeys.has(key);
      const keepUntilReady = tile.coord.z !== this.wantedZoom && !allReady;
      tile.group.visible = isWanted || keepUntilReady;
    }

    if (this.tiles.size <= MAX_CACHED_TILES) return;
    const hidden = [...this.tiles.entries()]
      .filter(([, tile]) => !tile.group.visible)
      .sort(([, a], [, b]) => a.lastWanted - b.lastWanted);
    for (const [key] of hidden.slice(0, this.tiles.size - MAX_CACHED_TILES)) this.unloadTile(key);
  }

  private addTile(coord: TileCoord, buffers: TileBuffers): void {
    const group = new THREE.Group();
    const origin = tileOriginInScene(coord.z, coord.x, coord.y);
    group.position.set(origin.x, 0, origin.z);

    for (const id of Object.keys(buffers.layers) as LayerId[]) {
      const layer = buffers.layers[id];
      if (!layer) continue;
      const geometry = toGeometry(layer);
      const object =
        id === 'edges'
          ? new THREE.LineSegments(geometry, this.materials.edges)
          : new THREE.Mesh(geometry, this.materials[id]);
      object.renderOrder = theme.renderOrder[id];
      object.matrixAutoUpdate = false;
      group.add(object);
    }

    group.updateMatrixWorld(true);
    this.root.add(group);
    this.tiles.set(tileKey(coord), {
      coord,
      group,
      labels: buffers.labels
        .map((label: TileLabel) => ({ ...label, worldX: origin.x + label.x, worldZ: origin.z + label.z }))
        .filter(({ worldX, worldZ }) => {
          const { minX, maxX, minZ, maxZ } = this.sceneBounds;
          return worldX >= minX && worldX <= maxX && worldZ >= minZ && worldZ <= maxZ;
        }),
      lastWanted: this.generation,
    });
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
