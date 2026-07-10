export type GameMode = "local" | "ai" | "room";

export type GameWorkspace = "local" | "ai" | "online-lobby" | "online-joining" | "online-table";

export type WorkspaceStateInput = {
  hasRoom: boolean;
  isJoiningRoom: boolean;
  mode: GameMode;
};

export function deriveGameWorkspace({ hasRoom, isJoiningRoom, mode }: WorkspaceStateInput): GameWorkspace {
  if (mode === "local" || mode === "ai") {
    return mode;
  }

  if (hasRoom) {
    return "online-table";
  }

  return isJoiningRoom ? "online-joining" : "online-lobby";
}

export function isOnlineWorkspaceEnabled(mode: GameMode): boolean {
  return mode === "room";
}
