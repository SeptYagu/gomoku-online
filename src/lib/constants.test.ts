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
});
