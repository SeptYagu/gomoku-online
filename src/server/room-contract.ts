import type { Stone } from "../game/types";
import type { RoomError, RoomSnapshot } from "./rooms";

export type RoomClientState = {
  playerId: string;
  seat: Stone;
  snapshot: RoomSnapshot;
};

export type RoomAck<T = RoomClientState> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: RoomError;
      ok: false;
    };
