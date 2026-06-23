export type Stone = "black" | "white";

export type Cell = Stone | null;

export type Board = Cell[][];

export type Point = {
  row: number;
  col: number;
};

export type GameStatus =
  | { state: "playing"; nextPlayer: Stone }
  | { state: "won"; winner: Stone; line: Point[] }
  | { state: "draw" };

export type Move = Point & {
  stone: Stone;
  moveNumber: number;
};
