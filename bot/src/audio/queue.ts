import type { AudioChunk } from "./chunker";

/**
 * A simple async FIFO queue handing chunks from the chunker to the transcription
 * loop (Phase 3). `dequeue()` resolves immediately if a chunk is waiting,
 * otherwise it parks until one is enqueued. FIFO order is preserved.
 */
export class ChunkQueue<T = AudioChunk> {
  private readonly items: T[] = [];
  private readonly waiters: ((item: T) => void)[] = [];

  enqueue(item: T): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
    } else {
      this.items.push(item);
    }
  }

  dequeue(): Promise<T> {
    const item = this.items.shift();
    if (item !== undefined) return Promise.resolve(item);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  get size(): number {
    return this.items.length;
  }
}
