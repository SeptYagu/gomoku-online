"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FriendRoomController } from "../useFriendRoom";

export const RoomContext = createContext<FriendRoomController | null>(null);

export type RoomProviderProps = {
  value: FriendRoomController;
  children: ReactNode;
};

export function RoomProvider({ value, children }: RoomProviderProps) {
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoomContext(): FriendRoomController {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error("useRoomContext must be used within a RoomProvider");
  }
  return context;
}

/**
 * Resolves the active room controller from either an explicit prop (for backward compatibility)
 * or from the nearest RoomProvider context.
 */
export function useOptionalRoomContext(roomProp?: FriendRoomController): FriendRoomController {
  const context = useContext(RoomContext);
  const resolved = roomProp ?? context;
  if (!resolved) {
    throw new Error("FriendRoomController must be provided via props or RoomProvider context");
  }
  return resolved;
}
