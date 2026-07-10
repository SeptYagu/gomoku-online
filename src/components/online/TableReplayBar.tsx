"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { TableReplayState } from "./table-replay";

type TableReplayBarProps = {
  dictionary: GameDictionary;
  onChange: (moveNumber: number) => void;
  onExit: () => void;
  replay: TableReplayState;
};

export function TableReplayBar({ dictionary, onChange, onExit, replay }: TableReplayBarProps) {
  const labels = dictionary.room;

  return (
    <section className="table-replay-bar" data-table-replay-controls>
      <div>
        <p className="metric-label">{labels.reviewGame}</p>
        <strong>{replay.gameId}</strong>
      </div>
      <div className="table-replay-controls">
        <button
          aria-label={labels.replayPrevious}
          className="icon-button"
          data-table-replay-step="previous"
          disabled={replay.moveNumber <= 0}
          onClick={() => onChange(replay.moveNumber - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" focusable={false} />
        </button>
        <input
          aria-label={labels.replayMove
            .replace("{move}", String(replay.moveNumber))
            .replace("{total}", String(replay.moves.length))}
          max={replay.moves.length}
          min={0}
          data-table-replay-slider
          onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
          type="range"
          value={replay.moveNumber}
        />
        <button
          aria-label={labels.replayNext}
          className="icon-button"
          data-table-replay-step="next"
          disabled={replay.moveNumber >= replay.moves.length}
          onClick={() => onChange(replay.moveNumber + 1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" focusable={false} />
        </button>
        <span>
          {labels.replayMove
            .replace("{move}", String(replay.moveNumber))
            .replace("{total}", String(replay.moves.length))}
        </span>
        <button className="mode-pill" data-table-replay-exit onClick={onExit} type="button">
          <X aria-hidden="true" focusable={false} />
          {labels.exitReplay}
        </button>
      </div>
    </section>
  );
}
