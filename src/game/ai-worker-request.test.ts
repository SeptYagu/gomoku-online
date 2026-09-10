import { describe, expect, it } from "vitest";
import { createBoard, placeStone } from "./board";
import { describeInvalidAiWorkerRequest, type AiWorkerRequest } from "./ai-worker-request";

describe("describeInvalidAiWorkerRequest", () => {
  it("accepts a well-formed request", () => {
    expect(describeInvalidAiWorkerRequest(createRequest())).toBeNull();
  });

  it("accepts optional shard, seed, and empty opening moves", () => {
    expect(
      describeInvalidAiWorkerRequest(
        createRequest({ moves: [], openingSeed: 0, rootCandidateShard: { index: 1, total: 4 } })
      )
    ).toBeNull();
  });

  it("rejects anything that is not an object", () => {
    expect(describeInvalidAiWorkerRequest(null)).toBe("request must be an object");
    expect(describeInvalidAiWorkerRequest("board")).toBe("request must be an object");
  });

  it("rejects a malformed board", () => {
    const board = createBoard();

    expect(describeInvalidAiWorkerRequest(createRequest({ board: board.slice(0, 14) }))).toContain("board must be");
    expect(describeInvalidAiWorkerRequest(createRequest({ board: board.map((row) => [...row, null]) }))).toContain(
      "board must be"
    );
    expect(
      describeInvalidAiWorkerRequest(createRequest({ board: board.map((row) => row.map(() => null)) }))
    ).toBeNull();
    expect(describeInvalidAiWorkerRequest(createRequest({ board: undefined }))).toContain("board must be");
  });

  it("rejects a cell that is not a stone or null", () => {
    const board = createBoard();
    const mutated = board.map((row) => [...row]);

    (mutated[3] as unknown[])[4] = "blue";

    expect(describeInvalidAiWorkerRequest(createRequest({ board: mutated as AiWorkerRequest["board"] }))).toContain(
      "board must be"
    );
  });

  it("rejects malformed moves", () => {
    expect(describeInvalidAiWorkerRequest(createRequest({ moves: "nope" as unknown as AiWorkerRequest["moves"] }))).toContain(
      "moves must be"
    );
    expect(
      describeInvalidAiWorkerRequest(
        createRequest({ moves: [{ col: 1, moveNumber: 1, row: 99, stone: "black" }] })
      )
    ).toContain("moves must be");
    expect(
      describeInvalidAiWorkerRequest(
        createRequest({ moves: [{ col: 1, moveNumber: 0, row: 1, stone: "black" }] })
      )
    ).toContain("moves must be");
    expect(
      describeInvalidAiWorkerRequest(
        createRequest({ moves: [{ col: 1, moveNumber: 1, row: 1, stone: "green" } as unknown as AiWorkerRequest["moves"][number]] })
      )
    ).toContain("moves must be");
  });

  it("rejects an unknown stone or difficulty", () => {
    expect(describeInvalidAiWorkerRequest(createRequest({ aiStone: "green" as AiWorkerRequest["aiStone"] }))).toBe(
      "aiStone must be black or white"
    );
    expect(
      describeInvalidAiWorkerRequest(createRequest({ difficulty: "impossible" as AiWorkerRequest["difficulty"] }))
    ).toContain("difficulty must be one of");
  });

  it("rejects a non-positive or non-finite time limit", () => {
    for (const timeLimitMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 11 * 60 * 1000, "1000" as unknown as number]) {
      expect(describeInvalidAiWorkerRequest(createRequest({ timeLimitMs }))).toBe(
        "timeLimitMs must be a positive finite number"
      );
    }
  });

  it("rejects an out-of-range candidate shard", () => {
    expect(
      describeInvalidAiWorkerRequest(createRequest({ rootCandidateShard: { index: 2, total: 2 } }))
    ).toContain("rootCandidateShard must be");
    expect(
      describeInvalidAiWorkerRequest(createRequest({ rootCandidateShard: { index: 0, total: 0 } }))
    ).toContain("rootCandidateShard must be");
  });

  it("rejects a non-integer opening seed", () => {
    expect(describeInvalidAiWorkerRequest(createRequest({ openingSeed: 1.5 }))).toBe("openingSeed must be an integer");
  });
});

function createRequest(overrides: Partial<AiWorkerRequest> = {}): AiWorkerRequest {
  return {
    aiStone: "white",
    board: placeStone(createBoard(), { col: 7, row: 7 }, "black"),
    difficulty: "normal",
    moves: [{ col: 7, moveNumber: 1, row: 7, stone: "black" }],
    timeLimitMs: 1_000,
    ...overrides
  };
}
