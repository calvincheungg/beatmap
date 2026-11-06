import type { TileBuffers } from '../layers/types';
import type { WorkerRequest, WorkerResponse } from './tile.worker';

/** Promise-based wrapper around the tile worker. */
export class TileWorkerClient {
  private readonly worker = new Worker(new URL('./tile.worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<
    number,
    { resolve: (buffers: TileBuffers | null) => void; reject: (error: Error) => void }
  >();
  private nextId = 0;

  constructor(url: string) {
    this.worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      if (data.ok) request.resolve(data.buffers);
      else request.reject(new Error(data.error));
    };
    // The worker can't resolve root-relative URLs on its own.
    this.post({ type: 'init', url: new URL(url, location.href).href });
  }

  load(z: number, x: number, y: number): Promise<TileBuffers | null> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ type: 'load', id, z, x, y });
    });
  }

  dispose(): void {
    this.worker.terminate();
  }

  private post(message: WorkerRequest): void {
    this.worker.postMessage(message);
  }
}
