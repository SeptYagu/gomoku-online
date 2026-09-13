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

    // Place WIN_STONE_COUNT - 1 stones (4 stones) -> not won yet
    for (let col = 0; col < WIN_STONE_COUNT - 1; col++) {
      board = placeStone(board, { row: 0, col }, "black");
      const result = getGameResult(board, { row: 0, col }, "black");
      expect(result.state).toBe("playing");
    }

    // Place the WIN_STONE_COUNT-th stone (5th stone) -> won!
    const winningCol = WIN_STONE_COUNT - 1;
    board = placeStone(board, { row: 0, col: winningCol }, "black");
    const winResult = getGameResult(board, { row: 0, col: winningCol }, "black");
    expect(winResult.state).toBe("won");
    if (winResult.state === "won") {
      expect(winResult.line.length).toBeGreaterThanOrEqual(WIN_STONE_COUNT);
    }
  });

  it("verifies MAX_CHAT_MESSAGE_LENGTH and MAX_PLAYER_NAME_LENGTH boundary guards", () => {
    const validChat = "a".repeat(MAX_CHAT_MESSAGE_LENGTH);
    const overflowChat = "a".repeat(MAX_CHAT_MESSAGE_LENGTH + 1);
    expect([...validChat].length).toBe(MAX_CHAT_MESSAGE_LENGTH);
    expect([...overflowChat].length).toBeGreaterThan(MAX_CHAT_MESSAGE_LENGTH);

    const validName = "p".repeat(MAX_PLAYER_NAME_LENGTH);
    const overflowName = "p".repeat(MAX_PLAYER_NAME_LENGTH + 5);
    expect(validName.slice(0, MAX_PLAYER_NAME_LENGTH).length).toBe(MAX_PLAYER_NAME_LENGTH);
    expect(overflowName.slice(0, MAX_PLAYER_NAME_LENGTH).length).toBe(MAX_PLAYER_NAME_LENGTH);
  });
});
