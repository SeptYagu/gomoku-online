"use client";

import { useEffect, useRef, useState } from "react";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { UndoRequestSnapshot } from "@/server/rooms";
import { TableActionButton } from "./TableActionBar";
import type { TableAction, TableActionId, TableUiState } from "./table-ui-state";

type TableTaskBarProps = {
  actions: TableAction[];
  copiedInvite: boolean;
  dictionary: GameDictionary;
  onAction: (action: TableActionId) => void;
  playerName: string;
  remainingUndoRequests: number;
  requesterName: string | null;
  resultText: string | null;
  state: TableUiState;
  undoRequest: UndoRequestSnapshot | null;
};

export function TableTaskBar({
  actions,
  copiedInvite,
  dictionary,
  onAction,
  playerName,
  remainingUndoRequests,
  requesterName,
  resultText,
  state,
  undoRequest
}: TableTaskBarProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const handledRequestRef = useRef(false);
  const taskActions = actions.filter((action) => action.placement === "task");
  const secondsLeft = undoRequest ? Math.max(0, Math.ceil((undoRequest.expiresAt - nowMs) / 1000)) : 0;
  const taskCopy = getTaskCopy(state, dictionary, playerName, requesterName, resultText);

  useEffect(() => {
    if (state !== "undo-response-required" || !undoRequest) {
      return;
    }

    const interval = window.setInterval(() => setNowMs(Date.now()), 250);

    return () => window.clearInterval(interval);
  }, [state, undoRequest]);

  useEffect(() => {
    if (state !== "undo-response-required" || !undoRequest || secondsLeft > 0 || handledRequestRef.current) {
      return;
    }

    handledRequestRef.current = true;
    onAction("reject-undo");
  }, [onAction, secondsLeft, state, undoRequest]);

  function handleAction(action: TableActionId) {
    if ((action === "allow-undo" || action === "reject-undo") && handledRequestRef.current) {
      return;
    }

    if (action === "allow-undo" || action === "reject-undo") {
      handledRequestRef.current = true;
    }

    onAction(action);
  }

  return (
    <section aria-label={dictionary.status.title} className="table-task-bar">
      <div className="table-task-copy">
        <p className="metric-label">{dictionary.status.title}</p>
        <strong aria-live="polite">{taskCopy}</strong>
      </div>
      {taskActions.length > 0 ? (
        <div className="table-task-actions">
          {taskActions.map((action) => (
            <TableActionButton
              action={action}
              copiedInvite={copiedInvite}
              dictionary={dictionary}
              key={action.id}
              onAction={handleAction}
              remainingUndoRequests={remainingUndoRequests}
              secondsLeft={secondsLeft}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function getTaskCopy(
  state: TableUiState,
  dictionary: GameDictionary,
  playerName: string,
  requesterName: string | null,
  resultText: string | null
): string {
  const labels = dictionary.room;

  switch (state) {
    case "spectating":
      return labels.spectatorStatus.replace("{name}", playerName);
    case "spectating-can-sit":
      return `${labels.spectatorStatus.replace("{name}", playerName)} ${labels.sitDown}.`;
    case "seated-waiting-opponent":
      return labels.waitingForOpponent;
    case "seated-not-ready":
      return labels.waitingForReady;
    case "seated-ready":
      return `${labels.ready} · ${labels.waitingForReady}`;
    case "ready-compat":
      return labels.readyToStart;
    case "playing-my-turn":
      return labels.yourTurn;
    case "playing-opponent-turn":
      return labels.opponentTurn;
    case "undo-request-pending":
      return labels.waitingForUndoResponse;
    case "undo-response-required":
      return labels.undoRequestCopy.replace("{name}", requesterName ?? labels.opponentTurn);
    case "finished-rematch-open":
      return `${resultText ?? labels.roomClosed} · ${labels.rematchPrompt}`;
    case "finished-rematch-ready":
      return `${resultText ?? labels.roomClosed} · ${labels.waitingForRematch}`;
    case "abandoned":
      return labels.roomClosed;
  }
}
