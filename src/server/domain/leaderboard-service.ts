import type { PlayerIdentityKind } from "../accounts";
import {
  GameRecordStore,
  type AuthoritativeGameRecord,
  type GameRecordClientSubmission,
  type GameRecordSubmitResult,
  type LeaderboardQuery,
  type LeaderboardSnapshot,
  type PlayerProfileSnapshot,
  type RoomGameRecordSnapshot,
  type SavedGameRecord
} from "../game-records";
import { type RoomResult, failure, success } from "./room-state-machine";

export type LeaderboardServiceOptions = {
  gameRecordStore?: GameRecordStore;
  now?: () => number;
};

export class LeaderboardService {
  private readonly gameRecordStore: GameRecordStore;
  private readonly now: () => number;

  constructor(options: LeaderboardServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.gameRecordStore = options.gameRecordStore ?? new GameRecordStore({ now: this.now });
  }

  get store(): GameRecordStore {
    return this.gameRecordStore;
  }

  recordAuthoritative(game: AuthoritativeGameRecord): SavedGameRecord {
    return this.gameRecordStore.recordAuthoritative(game);
  }

  submitGameRecord(input: GameRecordClientSubmission): RoomResult<GameRecordSubmitResult> {
    const game = this.gameRecordStore.getRecord(input.gameId);

    if (!game) {
      return failure("game-record-not-found", "Finished game record is no longer available.");
    }

    if (input.roomCode.trim().toUpperCase() !== game.roomCode) {
      return failure("game-record-invalid", "Submitted room code does not match this game.");
    }

    if (game.status !== "finished" && game.status !== "abandoned") {
      return failure("game-record-not-finished", "Only finished online games can be submitted.");
    }

    if (!game.players.some((player) => player.playerId === input.playerId)) {
      return failure("not-room-player", "Only players can submit this game record.");
    }

    try {
      return success(this.gameRecordStore.submit(game, input));
    } catch {
      return failure("game-record-invalid", "Could not save the submitted game record.");
    }
  }

  listGameRecords(limit?: number): SavedGameRecord[] {
    return this.gameRecordStore.listRecords(limit);
  }

  getRoomGameRecord(gameId: string, roomCode: string): RoomResult<RoomGameRecordSnapshot> {
    const record = this.gameRecordStore.getRoomRecord(gameId, roomCode);

    return record
      ? success(record)
      : failure("game-record-not-found", "Finished game record is no longer available.");
  }

  getLeaderboard(query?: LeaderboardQuery): LeaderboardSnapshot {
    return this.gameRecordStore.getLeaderboard(query);
  }

  getPlayerProfile(
    playerId: string,
    displayName?: string,
    limit?: number,
    identity?: PlayerIdentityKind
  ): PlayerProfileSnapshot {
    return this.gameRecordStore.getPlayerProfile(playerId, displayName, limit, identity);
  }
}
