import type { Stone } from "../game/types";
import type { GameRecordSubmitResult } from "./game-records";
import type { PublicChatSnapshot, RoomError, RoomListSnapshot, RoomParticipantRole, RoomSnapshot } from "./rooms";

export type RoomClientState = {
  name: string;
  playerId: string;
  role: RoomParticipantRole;
  seat: Stone | null;
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

export type RoomListAck =
  | {
      ok: true;
      value: RoomListSnapshot;
    }
  | {
      error: RoomError;
      ok: false;
    };

export type PublicChatAck =
  | {
      ok: true;
      value: PublicChatSnapshot;
    }
  | {
      error: RoomError;
      ok: false;
    };

export type GameRecordAck =
  | {
      ok: true;
      value: GameRecordSubmitResult;
    }
  | {
      error: RoomError;
      ok: false;
    };
