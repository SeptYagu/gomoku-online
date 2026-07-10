import { describe, expect, it } from "vitest";
import { deriveGameWorkspace, isOnlineWorkspaceEnabled, type WorkspaceStateInput } from "./workspace-state";

describe("deriveGameWorkspace", () => {
  const cases: Array<{ expected: ReturnType<typeof deriveGameWorkspace>; input: WorkspaceStateInput; name: string }> = [
    {
      expected: "local",
      input: { hasRoom: false, isJoiningRoom: false, mode: "local" },
      name: "local workspace"
    },
    {
      expected: "ai",
      input: { hasRoom: false, isJoiningRoom: false, mode: "ai" },
      name: "AI workspace"
    },
    {
      expected: "online-lobby",
      input: { hasRoom: false, isJoiningRoom: false, mode: "room" },
      name: "online lobby"
    },
    {
      expected: "online-joining",
      input: { hasRoom: false, isJoiningRoom: true, mode: "room" },
      name: "invite or stored-session joining gate"
    },
    {
      expected: "online-table",
      input: { hasRoom: true, isJoiningRoom: false, mode: "room" },
      name: "online table"
    },
    {
      expected: "online-table",
      input: { hasRoom: true, isJoiningRoom: true, mode: "room" },
      name: "acknowledged room wins over stale joining state"
    }
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(deriveGameWorkspace(testCase.input)).toBe(testCase.expected);
    });
  }
});

describe("isOnlineWorkspaceEnabled", () => {
  it("enables room effects only in online mode", () => {
    expect(isOnlineWorkspaceEnabled("local")).toBe(false);
    expect(isOnlineWorkspaceEnabled("ai")).toBe(false);
    expect(isOnlineWorkspaceEnabled("room")).toBe(true);
  });
});
