import type { AudioChunk } from "./chunker";

/**
 * A simple async FIFO queue handing chunks from the chunker to the transcription
 * loop. `dequeue()` resolves immediately if a chunk is waiting, otherwise it
 * parks until one is enqueued. When `maxSize` is set and the backlog exceeds it
 * (a slow CPU falling behind live speech), the oldest chunk is dropped so
 * captions stay near-real-time rather than lagging further and further.
 */
export class ChunkQueue<T = AudioChunk> {
  private readonly items: T[] = [];
  private readonly waiters: ((item: T) => void)[] = [];
  private droppedCount = 0;

  constructor(private readonly maxSize: number = Number.POSITIVE_INFINITY) {}

  enqueue(item: T): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
      return;
    }
    this.items.push(item);
    if (this.items.length > this.maxSize) {
      this.items.shift(); // drop oldest to stay current
      this.droppedCount++;
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

  /** How many chunks have been dropped due to backpressure. */
  get dropped(): number {
    return this.droppedCount;
  }
}
