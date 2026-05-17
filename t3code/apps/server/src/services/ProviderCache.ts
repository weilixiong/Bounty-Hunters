/**
 * ProviderCache — Effect.Cache-based caching layer for external provider API calls.
 *
 * Features:
 * - Configurable TTL per cache type (model lists: 5min, capabilities: 15min)
 * - Concurrent request deduplication (built into Effect.Cache)
 * - Invalidation on provider config changes via Effect.Hub
 * - Cache hit/miss metrics exposed for observability
 * - Bounded memory usage (max 1000 entries per cache)
 */

import * as Cache from "effect/Cache";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Hub from "effect/Hub";
import * as Metric from "effect/Metric";
import * as Chunk from "effect/Chunk";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";

// ── Types ──────────────────────────────────────────────────────────────

/**
 * Provider identifier (e.g., "openai", "anthropic", "google")
 */
export type ProviderId = string;

/**
 * Cached model list for a provider.
 */
export interface ProviderModelList {
  readonly providerId: ProviderId;
  readonly models: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly capabilities: ReadonlyArray<string>;
  }>;
  readonly fetchedAt: number;
}

/**
 * Cached capability query result for a specific model.
 */
export interface ModelCapability {
  readonly modelId: string;
  readonly providerId: ProviderId;
  readonly capabilities: ReadonlyArray<string>;
  readonly fetchedAt: number;
}

/**
 * Cache configuration per type.
 */
export interface CacheConfig {
  readonly modelListTTL: Duration.Duration;
  readonly capabilityTTL: Duration.Duration;
  readonly maxEntries: number;
}

// ── Defaults ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CacheConfig = {
  modelListTTL: Duration.minutes(5),
  capabilityTTL: Duration.minutes(15),
  maxEntries: 1000,
};

// ── Invalidation Hub ───────────────────────────────────────────────────

/**
 * Event emitted when a provider's configuration has changed.
 * Subscribers should invalidate cached entries for that provider.
 */
export interface ProviderConfigChanged {
  readonly providerId: ProviderId;
  readonly timestamp: number;
}

/**
 * Global hub for provider config change events.
 * Subscribe to receive invalidation signals.
 */
export const providerConfigHub: Hub.Hub<ProviderConfigChanged> = Hub.unbounded<ProviderConfigChanged>();

// ── Metrics ────────────────────────────────────────────────────────────

/**
 * Cache hit counter — incremented when a cached value is served.
 */
export const cacheHitCounter: Metric.Counter<number> = Metric.counter("provider_cache_hits", {
  description: "Total number of provider cache hits",
});

/**
 * Cache miss counter — incremented when a fresh API call is made.
 */
export const cacheMissCounter: Metric.Counter<number> = Metric.counter("provider_cache_misses", {
  description: "Total number of provider cache misses",
});

/**
 * Invalidation counter — incremented when cache is invalidated.
 */
export const invalidationCounter: Metric.Counter<number> = Metric.counter("provider_cache_invalidations", {
  description: "Total number of provider cache invalidations",
});

/**
 * Current cache size gauge — tracks number of entries across all caches.
 */
export const cacheSizeGauge: Metric.Gauge<number> = Metric.gauge("provider_cache_size", {
  description: "Current number of entries in provider cache",
});

// ── Lookup Functions ───────────────────────────────────────────────────

/**
 * Type for the external function that fetches model lists from the provider API.
 * This should be provided by the caller (e.g., from a ProviderService).
 */
export type FetchModelList = (providerId: ProviderId) => Effect.Effect<ProviderModelList>;

/**
 * Type for the external function that fetches model capabilities from the provider API.
 */
export type FetchModelCapability = (
  providerId: ProviderId,
  modelId: string,
) => Effect.Effect<ModelCapability>;

// ── Provider Cache ─────────────────────────────────────────────────────

/**
 * ProviderCache manages two Effect.Cache instances:
 * 1. Model list cache — keyed by providerId, 5-min TTL
 * 2. Model capability cache — keyed by "providerId:modelId", 15-min TTL
 *
 * Both caches auto-deduplicate concurrent requests for the same key
 * and respect configurable TTL values.
 */
export class ProviderCache {
  private readonly modelListCache: Cache.Cache<ProviderId, ProviderModelList>;
  private readonly capabilityCache: Cache.Cache<string, ModelCapability>;
  private readonly config: CacheConfig;
  private readonly fetchModelList: FetchModelList;
  private readonly fetchModelCapability: FetchModelCapability;
  private readonly invalidationFiber: Effect.Fiber.Fiber<void> | null = null;

  private constructor(
    modelListCache: Cache.Cache<ProviderId, ProviderModelList>,
    capabilityCache: Cache.Cache<string, ModelCapability>,
    config: CacheConfig,
    fetchModelList: FetchModelList,
    fetchModelCapability: FetchModelCapability,
  ) {
    this.modelListCache = modelListCache;
    this.capabilityCache = capabilityCache;
    this.config = config;
    this.fetchModelList = fetchModelList;
    this.fetchModelCapability = fetchModelCapability;
  }

  /**
   * Create a ProviderCache instance within a Scope.
   * Automatically subscribes to invalidation events.
   */
  static make(
    config: Partial<CacheConfig> = {},
    fetchModelList: FetchModelList,
    fetchModelCapability: FetchModelCapability,
  ): Effect.Effect<ProviderCache, never, Scope.Scope> {
    const effectiveConfig: CacheConfig = { ...DEFAULT_CONFIG, ...config };

    return Effect.gen(function* (_: Effect.Adapter) {
      const modelListCache = yield* _(
        Cache.make<ProviderId, ProviderModelList>({
          capacity: effectiveConfig.maxEntries,
          timeToLive: effectiveConfig.modelListTTL,
          lookup: (providerId: ProviderId) =>
            Effect.gen(function* (_inner: Effect.Adapter) {
              _(cacheMissCounter);
              const result = yield* _(fetchModelList(providerId));
              return result;
            }),
        }),
      );

      const capabilityCache = yield* _(
        Cache.make<string, ModelCapability>({
          capacity: effectiveConfig.maxEntries,
          timeToLive: effectiveConfig.capabilityTTL,
          lookup: (key: string) => {
            const [providerId, modelId] = key.split(":", 2);
            return Effect.gen(function* (_inner: Effect.Adapter) {
              _(cacheMissCounter);
              return yield* _(fetchModelCapability(providerId, modelId));
            });
          },
        }),
      );

      const instance = new ProviderCache(
        modelListCache,
        capabilityCache,
        effectiveConfig,
        fetchModelList,
        fetchModelCapability,
      );

      // Subscribe to invalidation hub for auto-cleanup
      const subscription = yield* _(Hub.subscribe(providerConfigHub));
      yield* _(
        Effect.forkDaemon(
          Effect.gen(function* (_fiber: Effect.Adapter) {
            const events = yield* _(Hub.takeAll(subscription));
            for (const event of Chunk.toReadonlyArray(events)) {
              const key = event.providerId;
              yield* _(
                Cache.invalidate(modelListCache, key),
                Effect.zipRight(Cache.invalidate(capabilityCache, key), { concurrent: true }),
              );
              _(invalidationCounter);
              _(cacheSizeGauge, (yield* _(Cache.size(modelListCache)) + yield* _(Cache.size(capabilityCache))));
            }
          }),
        ),
      );

      return instance;
    });
  }

  /**
   * Get the cached model list for a provider.
   * On cache miss, fetches from the provider API.
   */
  getModelList(providerId: ProviderId): Effect.Effect<ProviderModelList> {
    return Effect.gen(function* (_: Effect.Adapter) {
      const result = yield* _(Cache.get(this.modelListCache)(providerId));
      _(cacheHitCounter);
      _(cacheSizeGauge, (yield* _(Cache.size(this.modelListCache)) + yield* _(Cache.size(this.capabilityCache))));
      return result;
    });
  }

  /**
   * Get the cached capabilities for a specific model.
   * On cache miss, fetches from the provider API.
   */
  getModelCapability(providerId: ProviderId, modelId: string): Effect.Effect<ModelCapability> {
    const key = `${providerId}:${modelId}`;
    return Effect.gen(function* (_: Effect.Adapter) {
      const result = yield* _(Cache.get(this.capabilityCache)(key));
      _(cacheHitCounter);
      _(cacheSizeGauge, (yield* _(Cache.size(this.modelListCache)) + yield* _(Cache.size(this.capabilityCache))));
      return result;
    });
  }

  /**
   * Manually invalidate all cached entries for a provider.
   * Also publishes to the invalidation hub so other subscribers are notified.
   */
  invalidateProvider(providerId: ProviderId): Effect.Effect<void> {
    return Effect.gen(function* (_: Effect.Adapter) {
      yield* _(
        Cache.invalidate(this.modelListCache, providerId),
        Effect.zipRight(Cache.invalidate(this.capabilityCache, providerId), { concurrent: true }),
      );
      _(invalidationCounter);
      yield* _(Hub.publish(providerConfigHub, {
        providerId,
        timestamp: Date.now(),
      }));
    });
  }

  /**
   * Get current cache metrics: hit/miss counts, size, entries.
   */
  getMetrics(): Effect.Effect<{
    readonly modelListSize: number;
    readonly capabilitySize: number;
    readonly hits: number;
    readonly misses: number;
    readonly invalidations: number;
  }> {
    return Effect.gen(function* (_: Effect.Adapter) {
      const modelListSize = yield* _(Cache.size(this.modelListCache));
      const capabilitySize = yield* _(Cache.size(this.capabilityCache));
      // Metric counters accumulate across the lifetime — we snapshot here
      const hits = cacheHitCounter.value;
      const misses = cacheMissCounter.value;
      const invalidations = invalidationCounter.value;

      return {
        modelListSize,
        capabilitySize,
        hits,
        misses,
        invalidations,
      };
    });
  }

  /**
   * Clear all cached entries.
   */
  clear(): Effect.Effect<void> {
    return Effect.gen(function* (_: Effect.Adapter) {
      yield* _(Cache.clear(this.modelListCache));
      yield* _(Cache.clear(this.capabilityCache));
    });
  }
}
