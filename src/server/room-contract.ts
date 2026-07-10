import type { Stone } from "../game/types";
import type { PlayerIdentityKind } from "./accounts";
import type { GameRecordSubmitResult, RoomGameRecordSnapshot } from "./game-records";
import type {
  PresenceSnapshot,
  PublicChatSnapshot,
  RoomError,
  RoomListSnapshot,
  RoomParticipantRole,
  RoomSnapshot
} from "./rooms";

export type RoomClientState = {
  guestToken?: string;
  identity: PlayerIdentityKind;
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

export type PresenceAck =
  | {
      ok: true;
      value: PresenceSnapshot;
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

export type RoomGameRecordAck = RoomAck<RoomGameRecordSnapshot>;
