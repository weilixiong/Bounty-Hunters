import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

export interface RpcCallRecord {
  readonly method: string;
  readonly durationMs: number;
  readonly outcome: "success" | "error";
}

export interface MetricsWindow {
  readonly windowStart: number;
  readonly perMethod: Record<string, {
    count: number; errorCount: number; errorRate: number;
    p50Ms: number; p95Ms: number; p99Ms: number;
    minMs: number; maxMs: number; avgMs: number;
    throughput: number;
  }>;
  readonly totalRequests: number;
  readonly overallErrorRate: number;
}

export interface MetricsAggregator {
  readonly record: (call: RpcCallRecord) => Effect.Effect<void>;
  readonly snapshot: Effect.Effect<ReadonlyArray<MetricsWindow>>;
  readonly stream: Stream.Stream<MetricsWindow>;
}

export const MetricsAggregator = Context.GenericTag<MetricsAggregator>("MetricsAggregator");

interface Config {
  readonly windowWidthMs: number;
  readonly retentionCount: number;
  readonly slideIntervalMs: number;
}

const DEFAULT_CONFIG: Config = {
  windowWidthMs: 10_000, retentionCount: 6, slideIntervalMs: 10_000,
};

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(pct / 100 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function aggregateRecords(records: RpcCallRecord[], windowStart: number): MetricsWindow {
  const byMethod: Record<string, number[]> = {};
  const errorByMethod: Record<string, number> = {};
  let total = 0, totalErrors = 0;

  for (const r of records) {
    total++;
    if (!byMethod[r.method]) { byMethod[r.method] = []; errorByMethod[r.method] = 0; }
    byMethod[r.method].push(r.durationMs);
    if (r.outcome === "error") { errorByMethod[r.method]++; totalErrors++; }
  }

  const perMethod: MetricsWindow["perMethod"] = {};
  for (const [method, durs] of Object.entries(byMethod)) {
    const sorted = [...durs].sort((a, b) => a - b);
    const count = durs.length;
    const errCount = errorByMethod[method] || 0;
    const elapsed = (Date.now() - windowStart) / 1000 || 1;
    perMethod[method] = {
      count, errorCount: errCount, errorRate: count > 0 ? errCount / count : 0,
      p50Ms: percentile(sorted, 50), p95Ms: percentile(sorted, 95), p99Ms: percentile(sorted, 99),
      minMs: sorted[0] || 0, maxMs: sorted[sorted.length - 1] || 0,
      avgMs: count > 0 ? durs.reduce((a, b) => a + b, 0) / count : 0,
      throughput: count / elapsed,
    };
  }

  return { windowStart, perMethod, totalRequests: total, overallErrorRate: total > 0 ? totalErrors / total : 0 };
}

export const makeMetricsAggregator = (config: Config = DEFAULT_CONFIG): Effect.Effect<MetricsAggregator, never, Scope.Scope> =>
  Effect.gen(function* () {
    const buffer = yield* Ref.make<RpcCallRecord[]>([]);
    const windows = yield* Ref.make<MetricsWindow[]>([]);
    const streamSubjects: ((w: MetricsWindow) => void)[] = [];

    const slideAndAggregate = Effect.gen(function* () {
      const records = yield* Ref.getAndSet(buffer, []);
      if (records.length === 0) return;
      const window = aggregateRecords(records, Date.now());
      yield* Ref.update(windows, ws => [...ws, window].slice(-config.retentionCount));
      for (const notify of streamSubjects) notify(window);
    });

    const slideSchedule = Schedule.spaced(Duration.millis(config.slideIntervalMs));

    yield* Effect.forkScoped(
      Effect.forever(slideAndAggregate).pipe(Effect.schedule(slideSchedule)),
    );

    const makeStream = (): Stream.Stream<MetricsWindow> =>
      Stream.async<MetricsWindow>((emit) => {
        streamSubjects.push((w) => { emit.single(w); });
      });

    const service: MetricsAggregator = {
      record: call => Ref.update(buffer, b => [...b, call]),
      snapshot: Ref.get(windows),
      stream: makeStream(),
    };

    return service;
  });

export const MetricsAggregatorLayer = Layer.effect(
  MetricsAggregator,
  makeMetricsAggregator(),
);
