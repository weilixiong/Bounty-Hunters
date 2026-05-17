import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

export class CodexStreamChunk extends Data.TaggedClass("CodexStreamChunk")<{
  readonly index: number;
  readonly text: string;
  readonly timestamp: number;
}> {}

export class CodexStreamWarning extends Data.TaggedClass("CodexStreamWarning")<{
  readonly elapsedMs: number;
}> {}

export class CodexStreamComplete extends Data.TaggedClass("CodexStreamComplete")<{
  readonly chunkCount: number;
}> {}

export class CodexStreamTimeoutError extends Data.TaggedError("CodexStreamTimeoutError")<{
  readonly elapsedMs: number;
}> {}

export class CodexStreamAbortedError extends Data.TaggedError("CodexStreamAbortedError")<{}> {}

export type CodexStreamEvent = CodexStreamChunk | CodexStreamWarning | CodexStreamComplete;
export type CodexStreamError = CodexStreamTimeoutError | CodexStreamAbortedError;

interface StreamConfig {
  readonly queueCapacity: number;
  readonly chunkTimeoutMs: number;
  readonly totalTimeoutMs: number;
}

const DEFAULT_CONFIG: StreamConfig = {
  queueCapacity: 16, chunkTimeoutMs: 30_000, totalTimeoutMs: 120_000,
};

export const streamGeneration = (
  generator: (emit: (chunk: string) => void) => Promise<void>,
  signal?: AbortSignal,
  config: StreamConfig = DEFAULT_CONFIG,
): Stream.Stream<CodexStreamEvent, CodexStreamError> =>
  Stream.async<CodexStreamEvent, CodexStreamError>((emit) => {
    const run = async () => {
      const startTime = Date.now();
      let chunkIndex = 0;
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        emit.fail(new CodexStreamTimeoutError({ elapsedMs: Date.now() - startTime }));
      }, config.totalTimeoutMs);

      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          emit.fail(new CodexStreamAbortedError({}));
        }, { once: true });
      }

      const chunkTimeout = config.chunkTimeoutMs;
      let lastChunkTime = startTime;

      try {
        await generator(async (text) => {
          if (timedOut) return;
          lastChunkTime = Date.now();
          emit.single(new CodexStreamChunk({
            index: chunkIndex++, text, timestamp: lastChunkTime,
          }));
          if (Date.now() - lastChunkTime > chunkTimeout) {
            emit.single(new CodexStreamWarning({ elapsedMs: Date.now() - startTime }));
          }
        });

        if (!timedOut) {
          clearTimeout(timeout);
          emit.single(new CodexStreamComplete({ chunkCount: chunkIndex }));
          emit.end();
        }
      } catch (err) {
        clearTimeout(timeout);
        if (!timedOut) {
          emit.fail(err instanceof Error
            ? new CodexStreamTimeoutError({ elapsedMs: Date.now() - startTime })
            : new CodexStreamTimeoutError({ elapsedMs: Date.now() - startTime }));
        }
      }
    };

    run();
  });

export const collectStream = (
  stream: Stream.Stream<CodexStreamEvent, CodexStreamError>,
): Effect.Effect<string, CodexStreamError> =>
  Stream.runFold(stream, "", (acc, event) => {
    if (event instanceof CodexStreamChunk) return acc + event.text;
    return acc;
  });

export const streamGenerationWithAbort = (
  generator: (emit: (chunk: string) => void) => Promise<void>,
  config?: StreamConfig,
): Effect.Effect<Stream.Stream<CodexStreamEvent, CodexStreamError>, never, never> =>
  Effect.sync(() => {
    const controller = new AbortController();
    return streamGeneration(generator, controller.signal, config);
  }).pipe(
    Effect.map((stream) => stream.pipe(Stream.onError(() => Effect.sync(() => controller.abort())))),
  );

