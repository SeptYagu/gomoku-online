import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  COPY_FEEDBACK_DURATION_MS,
  DEFAULT_PLAYER_NAME,
  DISCONNECT_GRACE_MS,
  EMPTY_ROOM_GRACE_MS,
  LIFECYCLE_SWEEP_INTERVAL_MS,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  PAGINATION,
  WIN_STONE_COUNT
} from "./constants";

describe("constants", () => {
  it("exports board and game rule constants", () => {
    expect(BOARD_SIZE).toBe(15);
    expect(WIN_STONE_COUNT).toBe(5);
  });

  it("exports text and name length limits", () => {
    expect(MAX_CHAT_MESSAGE_LENGTH).toBe(160);
    expect(MAX_PLAYER_NAME_LENGTH).toBe(24);
  });

  it("exports default player configuration", () => {
    expect(DEFAULT_PLAYER_NAME).toBe("Player");
  });

  it("exports pagination configurations with frozen values", () => {
    expect(PAGINATION.LOBBY_ROOMS).toBe(20);
    expect(PAGINATION.PRESENCE_USERS).toBe(30);
    expect(PAGINATION.LEADERBOARD).toBe(10);
    expect(PAGINATION.PLAYER_PROFILE_RECORDS).toBe(50);
    expect(PAGINATION.DEFAULT_PROFILE_RECORDS).toBe(20);
  });

  it("exports timing and timeout constants", () => {
    expect(LIFECYCLE_SWEEP_INTERVAL_MS).toBe(10_000);
    expect(COPY_FEEDBACK_DURATION_MS).toBe(1_800);
    expect(DISCONNECT_GRACE_MS).toBe(60_000);
    expect(EMPTY_ROOM_GRACE_MS).toBe(60_000);
  });

  it("verifies BOARD_SIZE and WIN_STONE_COUNT actively govern game board and win conditions", async () => {
    const { createBoard, placeStone, getGameResult } = await import("@/game/board");
    let board = createBoard();
    expect(board.length).toBe(BOARD_SIZE);
    expect(board[0].length).toBe(BOARD_SIZE);

    // Place 4 stones -> not won yet (independent literal check)
    for (let col = 0; col < 4; col++) {
      board = placeStone(board, { row: 0, col }, "black");
      const result = getGameResult(board, { row: 0, col }, "black");
      expect(result.state).toBe("playing");
    }

    // Place the 5th stone -> won!
    board = placeStone(board, { row: 0, col: 4 }, "black");
    const winResult = getGameResult(board, { row: 0, col: 4 }, "black");
    expect(winResult.state).toBe("won");
    if (winResult.state === "won") {
      expect(winResult.line.length).toBe(5);
    }
  });

  it("verifies MAX_CHAT_MESSAGE_LENGTH and MAX_PLAYER_NAME_LENGTH in production code", async () => {
    const { AccountStore } = await import("@/server/accounts");
    const { RoomStore } = await import("@/server/rooms");

    // MAX_PLAYER_NAME_LENGTH: AccountStore normalizes/truncates display name to MAX_PLAYER_NAME_LENGTH (24)
    const accountStore = new AccountStore({ filePath: false });
    const accountResult = accountStore.createAccount({ displayName: "a".repeat(50) });
    expect(accountResult.ok).toBe(true);
    if (accountResult.ok) {
      expect(accountResult.value.displayName.length).toBe(MAX_PLAYER_NAME_LENGTH);
      expect(accountResult.value.displayName).toBe("a".repeat(MAX_PLAYER_NAME_LENGTH));
    }

    // MAX_CHAT_MESSAGE_LENGTH: RoomStore rejects message longer than MAX_CHAT_MESSAGE_LENGTH (160)
    let currentTime = 1_000_000;
    const roomStore = new RoomStore({ now: () => (currentTime += 2000) });
    const created = roomStore.createRoom({ playerId: "host_1", playerName: "Host" });
    expect(created.ok).toBe(true);
    if (created.ok) {
      const roomCode = created.value.code;
      const playerId = "host_1";

      // Exactly at limit -> accepted
      const validPost = roomStore.sendRoomChat(roomCode, playerId, "a".repeat(MAX_CHAT_MESSAGE_LENGTH));
      expect(validPost.ok).toBe(true);

      // Exceeds limit by 1 -> rejected with chat-message-too-long
      const overflowPost = roomStore.sendRoomChat(roomCode, playerId, "a".repeat(MAX_CHAT_MESSAGE_LENGTH + 1));
      expect(overflowPost.ok).toBe(false);
      if (!overflowPost.ok) {
        expect(overflowPost.error.code).toBe("chat-message-too-long");
      }
    }
  });
});
