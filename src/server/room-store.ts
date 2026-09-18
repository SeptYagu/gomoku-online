import { AccountStore, GuestSessionStore } from "./accounts";
import { FeedbackStore } from "./feedback-store";
import { GameRecordStore } from "./game-records";
import { RoomStore } from "./rooms";

const accountFilePath = process.env.GOMOKU_ACCOUNTS_PATH ?? "data/accounts/accounts.jsonl";
const gameRecordFilePath = process.env.GOMOKU_GAME_RECORDS_PATH ?? "data/game-records/records.jsonl";
const guestSessionFilePath = process.env.GOMOKU_GUEST_SESSIONS_PATH ?? "data/accounts/guest-sessions.jsonl";
const feedbackDirPath = process.env.GOMOKU_FEEDBACK_DIR ?? "data/feedback";

export const accountStore = new AccountStore({
  filePath: accountFilePath
});

export const guestSessionStore = new GuestSessionStore({
  filePath: guestSessionFilePath
});

export const feedbackStore = new FeedbackStore({
  dirPath: feedbackDirPath
});

export const roomStore = new RoomStore({
  gameRecordStore: new GameRecordStore({
    filePath: gameRecordFilePath
  })
});

