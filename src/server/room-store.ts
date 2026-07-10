import { AccountStore, GuestSessionStore } from "./accounts";
import { GameRecordStore } from "./game-records";
import { RoomStore } from "./rooms";

const accountFilePath = process.env.GOMOKU_ACCOUNTS_PATH ?? "data/accounts/accounts.jsonl";
const gameRecordFilePath = process.env.GOMOKU_GAME_RECORDS_PATH ?? "data/game-records/records.jsonl";

export const accountStore = new AccountStore({
  filePath: accountFilePath
});

export const guestSessionStore = new GuestSessionStore();

export const roomStore = new RoomStore({
  gameRecordStore: new GameRecordStore({
    filePath: gameRecordFilePath
  })
});
