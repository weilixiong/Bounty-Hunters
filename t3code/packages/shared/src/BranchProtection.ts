import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

export interface BranchProtectionRule {
  readonly isProtected: boolean;
  readonly allowsForcePush: boolean;
  readonly allowsDirectPush: boolean;
  readonly requiredReviewCount: number;
  readonly requiresStatusChecks: boolean;
  readonly requiredStatusChecks: ReadonlyArray<string>;
  readonly requiresSignedCommits: boolean;
  readonly requiresConversationResolution: boolean;
  readonly requiresLinearHistory: boolean;
}

export class BranchProtectionRule extends Data.TaggedClass("BranchProtectionRule")<BranchProtectionRule> {}

export const defaultRule: BranchProtectionRule = new BranchProtectionRule({
  isProtected: false, allowsForcePush: true, allowsDirectPush: true,
  requiredReviewCount: 0, requiresStatusChecks: false, requiredStatusChecks: [],
  requiresSignedCommits: false, requiresConversationResolution: false, requiresLinearHistory: false,
});

export interface BranchProtectionService {
  readonly getProtection: (owner: string, repo: string, branch: string, provider: "github" | "gitlab") => Effect.Effect<BranchProtectionRule, Error>;
  readonly invalidateCache: (key: string) => Effect.Effect<void>;
  readonly isForcePushAllowed: (rule: BranchProtectionRule) => boolean;
  readonly getProtectionTooltip: (rule: BranchProtectionRule) => string;
}

export const BranchProtectionService = Context.GenericTag<BranchProtectionService>("BranchProtectionService");

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry { readonly rule: BranchProtectionRule; readonly expiresAt: number; }

export const makeBranchProtectionService = Effect.gen(function* () {
  const cache = yield* Ref.make<Map<string, CacheEntry>>(new Map());
  const getCache = (key: string) => Ref.get(cache).pipe(Effect.map(m => {
    const e = m.get(key); if (!e || Date.now() > e.expiresAt) { m.delete(key); return Option.none(); } return Option.some(e.rule);
  }));
  const setCache = (key: string, rule: BranchProtectionRule) => Ref.update(cache, m => { m.set(key, { rule, expiresAt: Date.now() + CACHE_TTL_MS }); return m; });
  const fetchGH = (owner: string, repo: string, branch: string): Effect.Effect<BranchProtectionRule, Error> =>
    Effect.tryPromise(async () => {
      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}/protection`, { headers: { Accept: "application/vnd.github.v3+json" } });
      if (resp.status === 404) return defaultRule;
      if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);
      const j = await resp.json();
      return new BranchProtectionRule({
        isProtected: true, allowsForcePush: j.allow_force_pushes?.enabled ?? false,
        allowsDirectPush: !j.required_pull_request_reviews?.require_last_push_approval ?? true,
        requiredReviewCount: j.required_pull_request_reviews?.required_approving_review_count ?? 0,
        requiresStatusChecks: j.required_status_checks?.strict ?? false,
        requiredStatusChecks: j.required_status_checks?.contexts ?? [],
        requiresSignedCommits: j.required_signatures?.enabled ?? false,
        requiresConversationResolution: j.required_conversation_resolution?.enabled ?? false,
        requiresLinearHistory: j.required_linear_history?.enabled ?? false,
      });
    });
  const service: BranchProtectionService = {
    getProtection: (owner, repo, branch, provider) => Effect.flatMap(getCache(`${provider}/${owner}/${repo}/${branch}`), cached =>
      Option.isSome(cached) ? Effect.succeed(cached.value) : Effect.flatMap(
        provider === "github" ? fetchGH(owner, repo, branch) : Effect.succeed(defaultRule),
        rule => Effect.as(setCache(`${provider}/${owner}/${repo}/${branch}`, rule), rule))),
    invalidateCache: key => Ref.update(cache, m => { m.delete(key); return m; }),
    isForcePushAllowed: rule => rule.allowsForcePush,
    getProtectionTooltip: rule => {
      if (!rule.isProtected) return "Unprotected — force push allowed";
      const l: string[] = [];
      if (!rule.allowsForcePush) l.push("Force push blocked"); else l.push("Force push allowed");
      if (rule.requiresStatusChecks) l.push(`Checks required (${rule.requiredStatusChecks.length})`);
      if (rule.requiredReviewCount > 0) l.push(`${rule.requiredReviewCount} reviews`);
      if (rule.requiresSignedCommits) l.push("Signed commits");
      if (rule.requiresConversationResolution) l.push("Resolution required");
      if (rule.requiresLinearHistory) l.push("Linear history");
      return l.join("\n");
    },
  };
  return service;
});

export const BranchProtectionLayer = Layer.effect(BranchProtectionService, makeBranchProtectionService);

export const branchProtectionQueryKey = (owner: string, repo: string, branch: string): readonly [string, string, string, string] =>
  ["branchProtection", owner, repo, branch] as const;
