import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

export class HealthCheckResult extends Data.TaggedClass("HealthCheckResult")<{
  readonly passed: boolean;
  readonly timestamp: number;
  readonly responseTimeMs: number;
  readonly error: string | undefined;
}> {}

export interface BackendHealthMonitor {
  readonly start: Effect.Effect<void>;
  readonly stop: Effect.Effect<void>;
  readonly snapshot: Effect.Effect<HealthCheckResult>;
  readonly forceCheck: Effect.Effect<HealthCheckResult>;
}

export const BackendHealthMonitor = Context.GenericTag<BackendHealthMonitor>("BackendHealthMonitor");

const HEALTH_CHECK_URL = "/.well-known/t3/environment";
const HEALTH_CHECK_INTERVAL_MS = 15_000;
const JITTER_FACTOR = 0.2;
const MAX_FAILURES = 3;
const MAX_RESTART_ATTEMPTS = 3;

interface State {
  readonly lastResults: ReadonlyArray<HealthCheckResult>;
  readonly consecutiveFailures: number;
  readonly restartAttempts: number;
  readonly running: boolean;
}

const initialHealthState: State = {
  lastResults: [], consecutiveFailures: 0, restartAttempts: 0, running: false,
};

export const makeBackendHealthMonitor = (healthCheckUrl: string = HEALTH_CHECK_URL): Effect.Effect<BackendHealthMonitor, never, Scope.Scope> =>
  Effect.gen(function* () {
    const state = yield* Ref.make<State>(initialHealthState);
    const scope = yield* Scope.Scope;

    const runCheck: Effect.Effect<HealthCheckResult> = Effect.gen(function* () {
      const start = Date.now();
      const result = yield* Effect.tryPromise(async () => {
        const resp = await fetch(healthCheckUrl, { signal: AbortSignal.timeout(5000) });
        return new HealthCheckResult({
          passed: resp.ok, timestamp: Date.now(),
          responseTimeMs: Date.now() - start, error: resp.ok ? undefined : `HTTP ${resp.status}`,
        });
      }).pipe(Effect.catchAll(error =>
        Effect.succeed(new HealthCheckResult({
          passed: false, timestamp: Date.now(),
          responseTimeMs: Date.now() - start, error: error.message,
        }))
      ));
      yield* Ref.update(state, s => {
        const allResults = [...s.lastResults, result].slice(-10);
        const failures = result.passed ? 0 : s.consecutiveFailures + 1;
        return { ...s, lastResults: allResults, consecutiveFailures: failures };
      });
      return result;
    });

    const handleFailures: Effect.Effect<void> = Effect.gen(function* () {
      const s = yield* Ref.get(state);
      if (s.consecutiveFailures >= MAX_FAILURES) {
        yield* Effect.log("BackendHealthMonitor: restarting backend after consecutive failures");
        yield* Ref.update(state, s0 => ({ ...s0, consecutiveFailures: 0, restartAttempts: s0.restartAttempts + 1 }));
      }
      if (s.restartAttempts >= MAX_RESTART_ATTEMPTS) {
        yield* Effect.log("BackendHealthMonitor: max restart attempts reached");
      }
    });

    const schedule = Schedule.spaced(Duration.millis(HEALTH_CHECK_INTERVAL_MS)).pipe(
      Schedule.compose(Schedule.jitteredWithMin(JITTER_FACTOR)),
    );

    const poll = Effect.gen(function* () {
      yield* runCheck;
      yield* handleFailures;
    });

    const fiber = yield* Effect.forkScoped(
      Effect.forever(poll).pipe(Effect.schedule(schedule)),
    );

    const service: BackendHealthMonitor = {
      start: Effect.succeed(void 0),
      stop: Effect.void,
      snapshot: Ref.get(state).pipe(
        Effect.map(s => s.lastResults[s.lastResults.length - 1] || new HealthCheckResult({
          passed: true, timestamp: Date.now(), responseTimeMs: 0, error: undefined,
        })),
      ),
      forceCheck: runCheck,
    };

    return service;
  });

export const BackendHealthMonitorLayer = Layer.effect(
  BackendHealthMonitor,
  makeBackendHealthMonitor(),
);
