import { describe, expect, it } from "vitest";
import {
  getModeChangeDecision,
  requiresOnlineLeaveConfirmation,
  resolveNextAiSettings,
  shouldDeferAiSettingChange
} from "./interaction-guards";

describe("interaction guards", () => {
  it.each([
    { expected: "noop", currentMode: "ai", nextMode: "ai", moves: 4, role: null, status: null },
    { expected: "confirm-ai", currentMode: "ai", nextMode: "local", moves: 1, role: null, status: null },
    { expected: "direct", currentMode: "ai", nextMode: "room", moves: 0, role: null, status: null },
    { expected: "confirm-online", currentMode: "room", nextMode: "ai", moves: 0, role: "player", status: "playing" },
    { expected: "direct", currentMode: "room", nextMode: "local", moves: 0, role: "spectator", status: "playing" },
    { expected: "direct", currentMode: "room", nextMode: "ai", moves: 0, role: "player", status: "waiting" }
  ] as const)("returns $expected for $currentMode -> $nextMode", ({ currentMode, expected, moves, nextMode, role, status }) => {
    expect(
      getModeChangeDecision({
        currentMode,
        localMoveCount: moves,
        nextMode,
        onlineRole: role,
        onlineStatus: status
      })
    ).toBe(expected);
  });

  it("only protects an active online player seat", () => {
    expect(requiresOnlineLeaveConfirmation("player", "playing")).toBe(true);
    expect(requiresOnlineLeaveConfirmation("spectator", "playing")).toBe(false);
    expect(requiresOnlineLeaveConfirmation("player", "finished")).toBe(false);
  });

  it("defers AI settings after the first move and resolves pending values for the next game", () => {
    expect(shouldDeferAiSettingChange(0)).toBe(false);
    expect(shouldDeferAiSettingChange(1)).toBe(true);
    expect(
      resolveNextAiSettings({
        aiDifficulty: "normal",
        firstPlayer: "human",
        pendingDifficulty: "expert",
        pendingFirstPlayer: "ai"
      })
    ).toEqual({ aiDifficulty: "expert", firstPlayer: "ai" });
  });
});
