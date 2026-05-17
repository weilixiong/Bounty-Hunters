import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { BranchProtectionRule, defaultRule, branchProtectionQueryKey } from "./BranchProtection.js";

describe("BranchProtection", () => {
  describe("defaultRule", () => {
    it("should be unprotected by default", () => {
      expect(defaultRule.isProtected).toBe(false);
      expect(defaultRule.allowsForcePush).toBe(true);
    });
  });

  describe("isForcePushAllowed", () => {
    it("should return true when allowed", () => {
      const rule = new BranchProtectionRule({
        isProtected: true, allowsForcePush: true, allowsDirectPush: true,
        requiredReviewCount: 0, requiresStatusChecks: false, requiredStatusChecks: [],
        requiresSignedCommits: false, requiresConversationResolution: false, requiresLinearHistory: false,
      });
      expect(defaultRule.isForcePushAllowed(rule)).toBe(true);
    });

    it("should return false when blocked", () => {
      const rule = new BranchProtectionRule({
        isProtected: true, allowsForcePush: false, allowsDirectPush: false,
        requiredReviewCount: 1, requiresStatusChecks: true, requiredStatusChecks: ["ci/ci"],
        requiresSignedCommits: true, requiresConversationResolution: true, requiresLinearHistory: true,
      });
      expect(defaultRule.isForcePushAllowed(rule)).toBe(false);
    });
  });

  describe("branchProtectionQueryKey", () => {
    it("should return fixed tuple", () => {
      expect(branchProtectionQueryKey("owner", "repo", "main")).toEqual(["branchProtection", "owner", "repo", "main"]);
    });
  });
});
