import { GameRecordStore } from "./game-records";
import { RoomStore } from "./rooms";

const gameRecordFilePath = process.env.GOMOKU_GAME_RECORDS_PATH ?? "data/game-records/records.jsonl";

export const roomStore = new RoomStore({
  gameRecordStore: new GameRecordStore({
    filePath: gameRecordFilePath
  })
});
