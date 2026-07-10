"use client";

import { Bot, CircleDot, RotateCcw, Undo2, UserRound, X } from "lucide-react";
import type { AiDifficulty } from "@/game/ai";
import type { Board, Move, Point, Stone } from "@/game/types";
import type { GameDictionary } from "@/i18n/dictionaries";
import { GomokuBoard } from "../GomokuBoard";

export type FirstPlayer = "human" | "ai";

const AI_DIFFICULTIES: AiDifficulty[] = ["normal", "hard", "expert", "insane"];

type AiGameViewProps = {
  aiDifficulty: AiDifficulty;
  board: Board;
  canPlay: boolean;
  canUndo: boolean;
  dictionary: GameDictionary;
  firstPlayer: FirstPlayer;
  isAiThinking: boolean;
  lastMove: Move | null;
  nextPlayer: Stone;
  onDifficultyChange: (difficulty: AiDifficulty) => void;
  onCancelPendingSettings: () => void;
  onFirstPlayerChange: (firstPlayer: FirstPlayer) => void;
  onPointSelect: (point: Point) => void;
  onReset: () => void;
  onUndo: () => void;
  pendingDifficulty: AiDifficulty | null;
  pendingFirstPlayer: FirstPlayer | null;
  winningKey: Set<string>;
};

export function AiGameView({
  aiDifficulty,
  board,
  canPlay,
  canUndo,
  dictionary,
  firstPlayer,
  isAiThinking,
  lastMove,
  nextPlayer,
  onDifficultyChange,
  onCancelPendingSettings,
  onFirstPlayerChange,
  onPointSelect,
  onReset,
  onUndo,
  pendingDifficulty,
  pendingFirstPlayer,
  winningKey
}: AiGameViewProps) {
  return (
    <section data-play-view="ai">
      <div className="difficulty-strip" aria-label={dictionary.ai.firstPlayerLabel}>
        <button
          className={`mode-pill ${firstPlayer === "human" ? "active" : ""}${pendingFirstPlayer === "human" ? " pending-setting" : ""}`}
          type="button"
          onClick={() => onFirstPlayerChange("human")}
          disabled={isAiThinking}
        >
          <UserRound aria-hidden="true" focusable={false} />
          {dictionary.ai.humanFirst}
        </button>
        <button
          className={`mode-pill ${firstPlayer === "ai" ? "active" : ""}${pendingFirstPlayer === "ai" ? " pending-setting" : ""}`}
          type="button"
          onClick={() => onFirstPlayerChange("ai")}
          disabled={isAiThinking}
        >
          <Bot aria-hidden="true" focusable={false} />
          {dictionary.ai.aiFirst}
        </button>
      </div>

      <div className="difficulty-strip" aria-label={dictionary.ai.difficultyLabel}>
        {AI_DIFFICULTIES.map((difficulty) => (
          <button
            className={`mode-pill ${aiDifficulty === difficulty ? "active" : ""}${pendingDifficulty === difficulty ? " pending-setting" : ""}`}
            key={difficulty}
            type="button"
            onClick={() => onDifficultyChange(difficulty)}
            disabled={isAiThinking}
          >
            <CircleDot aria-hidden="true" focusable={false} />
            {dictionary.ai[difficulty]}
          </button>
        ))}
      </div>

      {pendingDifficulty || pendingFirstPlayer ? (
        <div className="ai-pending-settings" data-ai-pending-settings role="status">
          <span>
            {dictionary.ai.settingsNextGame.replace(
              "{settings}",
              [
                pendingFirstPlayer ? dictionary.ai[pendingFirstPlayer === "ai" ? "aiFirst" : "humanFirst"] : null,
                pendingDifficulty ? dictionary.ai[pendingDifficulty] : null
              ]
                .filter((value): value is string => Boolean(value))
                .join(" · ")
            )}
          </span>
          <button className="mode-pill" onClick={onCancelPendingSettings} type="button">
            <X aria-hidden="true" focusable={false} />
            {dictionary.ai.cancelSettingsChange}
          </button>
        </div>
      ) : null}

      <div className="game-actions">
        <button className="mode-pill" disabled={!canUndo} onClick={onUndo} type="button">
          <Undo2 aria-hidden="true" focusable={false} />
          {dictionary.controls.undo}
        </button>
        <button className="mode-pill" disabled={isAiThinking} onClick={onReset} type="button">
          <RotateCcw aria-hidden="true" focusable={false} />
          {dictionary.controls.reset}
        </button>
      </div>

      <div className="play-area">
        <GomokuBoard
          board={board}
          isInteractive={canPlay}
          labels={{
            board: dictionary.board.label,
            point: dictionary.board.point
          }}
          lastMove={lastMove}
          previewStone={nextPlayer}
          winningKey={winningKey}
          onPointSelect={onPointSelect}
        />
      </div>
    </section>
  );
}
