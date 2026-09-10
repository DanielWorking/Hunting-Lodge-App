/**
 * @file lruCache.ts
 *
 * High-performance, memory-bounded Least Recently Used (LRU) Cache.
 * Implements active TTL pruning and capacity bounding with O(1) operations.
 */

export interface LRUCacheOptions {
    readonly max: number;
    readonly ttl?: number; // Time-to-live in milliseconds
}

interface CacheEntry<V> {
    readonly value: V;
    readonly expiresAt?: number;
}

export class BoundedLRUCache<K, V> {
    private readonly map = new Map<K, CacheEntry<V>>();
    private readonly max: number;
    private readonly defaultTtl?: number;

    constructor(options: LRUCacheOptions) {
        this.max = Math.max(1, options.max);
        this.defaultTtl = options.ttl;
    }

    public get size(): number {
        return this.map.size;
    }

    public get(key: K): V | undefined {
        const entry = this.map.get(key);
        if (!entry) {
            return undefined;
        }

        // Check active TTL expiration
        if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
            this.map.delete(key);
            return undefined;
        }

        // Refresh recency by re-inserting into Map (FIFO -> LRU)
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }

    public set(key: K, value: V, options?: { ttl?: number }): this {
        if (this.map.has(key)) {
            this.map.delete(key);
        } else if (this.map.size >= this.max) {
            // Evict least-recently used (oldest inserted) entry
            const oldestKey = this.map.keys().next().value;
            if (oldestKey !== undefined) {
                this.map.delete(oldestKey);
            }
        }

        const effectiveTtl = options?.ttl ?? this.defaultTtl;
        const expiresAt = effectiveTtl !== undefined ? Date.now() + effectiveTtl : undefined;

        this.map.set(key, { value, expiresAt });
        return this;
    }

    public has(key: K): boolean {
        return this.get(key) !== undefined;
    }

    public delete(key: K): boolean {
        return this.map.delete(key);
    }

    public clear(): void {
        this.map.clear();
    }

    public prune(): void {
        const now = Date.now();
        for (const [key, entry] of this.map.entries()) {
            if (entry.expiresAt !== undefined && now > entry.expiresAt) {
                this.map.delete(key);
            }
        }
    }
}
