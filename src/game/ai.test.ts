import { describe, expect, it } from "vitest";
import { chooseAiMove, getAiTimeLimitMs, getThreatSummaryAfterMove } from "./ai";
import { createBoard, getGameResult, getLegalMoves, placeStone } from "./board";
import type { Board, Move, Point, Stone } from "./types";

describe("ai", () => {
  it("plays the center on an empty board in every difficulty", () => {
    expect(chooseAiMove(createBoard(), "white", { difficulty: "normal" })).toEqual({
      row: 7,
      col: 7
    });
    expect(chooseAiMove(createBoard(), "white", { difficulty: "hard" })).toEqual({
      row: 7,
      col: 7
    });
    expect(chooseAiMove(createBoard(), "white", { difficulty: "expert" })).toEqual({
      row: 7,
      col: 7
    });
    expect(chooseAiMove(createBoard(), "white", { difficulty: "insane" })).toEqual({
      row: 7,
      col: 7
    });
  });

  it("uses bounded maximum think times by difficulty", () => {
    expect(getAiTimeLimitMs("normal")).toBe(1_000);
    expect(getAiTimeLimitMs("hard")).toBe(5_000);
    expect(getAiTimeLimitMs("expert")).toBe(10_000);
    expect(getAiTimeLimitMs("insane")).toBe(30_000);
  });

  it("takes an immediate winning move before searching", () => {
    const board = placeLine(createBoard(), { row: 6, col: 4 }, { row: 0, col: 1 }, 4, "white");
    const move = chooseAiMove(board, "white", { difficulty: "hard" });

    expect(move).not.toBeNull();
    expect(getGameResult(placeStone(board, move!, "white"), move!, "white").state).toBe("won");
  });

  it("blocks the opponent's open four", () => {
    const board = placeLine(createBoard(), { row: 8, col: 5 }, { row: 0, col: 1 }, 4, "black");
    const move = chooseAiMove(board, "white", { difficulty: "expert" });

    expect([
      { row: 8, col: 4 },
      { row: 8, col: 9 }
    ]).toContainEqual(move);
  });

  it("always returns a legal empty point", () => {
    let board = createBoard();
    board = placeStone(board, { row: 7, col: 7 }, "black");
    board = placeStone(board, { row: 7, col: 8 }, "white");
    board = placeStone(board, { row: 8, col: 7 }, "black");

    const move = chooseAiMove(board, "white", { difficulty: "normal" });

    expect(move).not.toBeNull();
    expect(getLegalMoves(board)).toContainEqual(move);
  });

  it("normal difficulty prefers a stronger scored extension", () => {
    let board = createBoard();
    board = placeStone(board, { row: 7, col: 7 }, "white");
    board = placeStone(board, { row: 7, col: 8 }, "white");
    board = placeStone(board, { row: 3, col: 3 }, "black");

    expect(chooseAiMove(board, "white", { difficulty: "normal" })).toEqual({
      row: 7,
      col: 6
    });
  });

  it("uses deeper opening book lines on stronger difficulties", () => {
    let game = playMoves([
      ["black", 7, 7],
      ["white", 6, 6],
      ["black", 8, 8]
    ]);

    expect(chooseAiMove(game.board, "white", { difficulty: "hard", moves: game.moves })).toEqual({
      row: 6,
      col: 7
    });

    game = playMoves([
      ["black", 7, 7],
      ["white", 6, 6],
      ["black", 8, 8],
      ["white", 6, 7],
      ["black", 7, 6]
    ]);

    expect(chooseAiMove(game.board, "white", { difficulty: "expert", moves: game.moves })).toEqual({
      row: 8,
      col: 6
    });

    game = playMoves([
      ["black", 7, 7],
      ["white", 6, 6],
      ["black", 8, 8],
      ["white", 6, 7],
      ["black", 7, 6],
      ["white", 8, 6],
      ["black", 6, 8]
    ]);

    expect(chooseAiMove(game.board, "white", { difficulty: "insane", moves: game.moves })).toEqual({
      row: 8,
      col: 7
    });
  });

  it("insane difficulty can block a one-ply forced win", () => {
    let board = createBoard();
    board = placeStone(board, { row: 7, col: 7 }, "black");
    board = placeStone(board, { row: 7, col: 8 }, "black");
    board = placeStone(board, { row: 7, col: 9 }, "black");
    board = placeStone(board, { row: 7, col: 10 }, "black");
    board = placeStone(board, { row: 6, col: 7 }, "white");
    board = placeStone(board, { row: 8, col: 7 }, "white");

    const move = chooseAiMove(board, "white", { difficulty: "insane" });

    expect(move).not.toBeNull();
    expect([
      { row: 7, col: 6 },
      { row: 7, col: 11 }
    ]).toContainEqual(move);
  });

  it("classifies forcing threats for tactical extensions", () => {
    let board = createBoard();
    board = placeStone(board, { row: 7, col: 5 }, "black");
    board = placeStone(board, { row: 7, col: 6 }, "black");
    board = placeStone(board, { row: 7, col: 8 }, "black");

    const openFour = getThreatSummaryAfterMove(board, { row: 7, col: 7 }, "black");

    expect(openFour.openFours).toBeGreaterThan(0);
    expect(openFour.simpleFours).toBe(0);

    board = placeStone(board, { row: 7, col: 9 }, "white");

    const simpleFour = getThreatSummaryAfterMove(board, { row: 7, col: 7 }, "black");

    expect(simpleFour.openFours).toBe(0);
    expect(simpleFour.simpleFours).toBeGreaterThan(0);
  });

  it("detects broken-four windows as forcing threats", () => {
    let board = createBoard();
    board = placeStone(board, { row: 7, col: 4 }, "black");
    board = placeStone(board, { row: 7, col: 5 }, "black");
    board = placeStone(board, { row: 7, col: 7 }, "black");

    const threat = getThreatSummaryAfterMove(board, { row: 7, col: 8 }, "black");

    expect(threat.openFours).toBeGreaterThan(0);
  });

  it("scores double open-three shapes as compound threats", () => {
    let board = createBoard();
    board = placeStone(board, { row: 7, col: 6 }, "black");
    board = placeStone(board, { row: 7, col: 8 }, "black");
    board = placeStone(board, { row: 6, col: 7 }, "black");
    board = placeStone(board, { row: 8, col: 7 }, "black");

    const threat = getThreatSummaryAfterMove(board, { row: 7, col: 7 }, "black");

    expect(threat.openThrees).toBeGreaterThanOrEqual(2);
    expect(threat.score).toBeGreaterThan(1_000_000);
  });

  it("insane can start a forcing four threat", () => {
    let board = createBoard();
    board = placeStone(board, { row: 7, col: 6 }, "black");
    board = placeStone(board, { row: 7, col: 7 }, "black");
    board = placeStone(board, { row: 7, col: 8 }, "black");
    board = placeStone(board, { row: 6, col: 6 }, "white");
    board = placeStone(board, { row: 8, col: 8 }, "white");

    const move = chooseAiMove(board, "black", { difficulty: "insane" });

    expect([
      { row: 7, col: 5 },
      { row: 7, col: 9 }
    ]).toContainEqual(move);
  });

  it("keeps stronger difficulties responsive on benchmark positions", () => {
    const benchmark = playMoves([
      ["black", 7, 7],
      ["white", 7, 8],
      ["black", 8, 8],
      ["white", 6, 6],
      ["black", 8, 7],
      ["white", 6, 8],
      ["black", 9, 6],
      ["white", 5, 9],
      ["black", 9, 8],
      ["white", 10, 7],
      ["black", 6, 7],
      ["white", 8, 5]
    ]);

    const hardStart = performance.now();
    const hardMove = chooseAiMove(benchmark.board, "black", { difficulty: "hard", moves: benchmark.moves });
    const hardDuration = performance.now() - hardStart;

    expect(hardMove).not.toBeNull();
    expect(getLegalMoves(benchmark.board)).toContainEqual(hardMove);
    expect(hardDuration).toBeLessThan(2_500);

    const insaneStart = performance.now();
    const insaneMove = chooseAiMove(benchmark.board, "black", { difficulty: "insane", moves: benchmark.moves });
    const insaneDuration = performance.now() - insaneStart;

    expect(insaneMove).not.toBeNull();
    expect(getLegalMoves(benchmark.board)).toContainEqual(insaneMove);
    expect(insaneDuration).toBeLessThan(8_000);
  });

  it("returns a legal best-so-far move when the search budget is exhausted", () => {
    const detachedOpening = playMoves([
      ["black", 7, 7],
      ["white", 5, 5]
    ]);
    const reportedMoves: Point[] = [];
    const started = performance.now();
    const move = chooseAiMove(detachedOpening.board, "black", {
      difficulty: "insane",
      moves: detachedOpening.moves,
      timeLimitMs: 5,
      onBestMove: (point) => reportedMoves.push(point)
    });
    const duration = performance.now() - started;

    expect(move).not.toBeNull();
    expect(getLegalMoves(detachedOpening.board)).toContainEqual(move);
    expect(reportedMoves.length).toBeGreaterThan(0);
    expect(getLegalMoves(detachedOpening.board)).toContainEqual(reportedMoves.at(-1));
    expect(duration).toBeLessThan(1_000);
  });
});

function placeLine(
  board: Board,
  start: Point,
  step: Point,
  count: number,
  stone: Stone
): Board {
  let nextBoard = board;

  for (let offset = 0; offset < count; offset += 1) {
    nextBoard = placeStone(
      nextBoard,
      {
        row: start.row + step.row * offset,
        col: start.col + step.col * offset
      },
      stone
    );
  }

  return nextBoard;
}

function playMoves(sequence: Array<[Stone, number, number]>): { board: Board; moves: Move[] } {
  return sequence.reduce(
    (game, [stone, row, col], index) => ({
      board: placeStone(game.board, { row, col }, stone),
      moves: [...game.moves, { row, col, stone, moveNumber: index + 1 }]
    }),
    { board: createBoard(), moves: [] as Move[] }
  );
}
