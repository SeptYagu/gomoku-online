"use client";

import { Check, Copy, Flag, History, LogOut, RotateCcw, Undo2, UserRound, X } from "lucide-react";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { TableAction, TableActionId } from "./table-ui-state";

type TableActionBarProps = {
  actions: TableAction[];
  copiedInvite: boolean;
  dictionary: GameDictionary;
  onAction: (action: TableActionId) => void;
  remainingUndoRequests: number;
};

type TableActionButtonProps = Omit<TableActionBarProps, "actions"> & {
  action: TableAction;
  secondsLeft?: number;
};

export function TableActionBar({
  actions,
  copiedInvite,
  dictionary,
  onAction,
  remainingUndoRequests
}: TableActionBarProps) {
  const toolbarActions = actions.filter((action) => action.placement === "toolbar");

  if (toolbarActions.length === 0) {
    return null;
  }

  return (
    <div aria-label={dictionary.status.title} className="table-action-bar">
      {toolbarActions.map((action) => (
        <TableActionButton
          action={action}
          copiedInvite={copiedInvite}
          dictionary={dictionary}
          key={action.id}
          onAction={onAction}
          remainingUndoRequests={remainingUndoRequests}
        />
      ))}
    </div>
  );
}

export function TableActionButton({
  action,
  copiedInvite,
  dictionary,
  onAction,
  remainingUndoRequests,
  secondsLeft = 0
}: TableActionButtonProps) {
  const labels = dictionary.room;
  const label = getActionLabel(action.id, dictionary, copiedInvite, remainingUndoRequests, secondsLeft);
  const tone = getActionTone(action.id);

  return (
    <button
      className={`mode-pill${tone ? ` ${tone}` : ""}`}
      data-table-action={action.id}
      onClick={() => onAction(action.id)}
      type="button"
    >
      {action.id === "copy-invite" ? <Copy aria-hidden="true" focusable={false} /> : null}
      {action.id === "cancel-wait" ? <X aria-hidden="true" focusable={false} /> : null}
      {action.id === "ready" || action.id === "allow-undo" ? <Check aria-hidden="true" focusable={false} /> : null}
      {action.id === "unready" || action.id === "reject-undo" ? <X aria-hidden="true" focusable={false} /> : null}
      {action.id === "undo" ? <Undo2 aria-hidden="true" focusable={false} /> : null}
      {action.id === "resign" ? <Flag aria-hidden="true" focusable={false} /> : null}
      {action.id === "replay" ? <History aria-hidden="true" focusable={false} /> : null}
      {action.id === "rematch-ready" || action.id === "rematch-cancel" ? (
        <RotateCcw aria-hidden="true" focusable={false} />
      ) : null}
      {action.id === "sit" ? <UserRound aria-hidden="true" focusable={false} /> : null}
      {action.id === "leave" ? <LogOut aria-hidden="true" focusable={false} /> : null}
      <span>{label || labels.leaveRoom}</span>
    </button>
  );
}

function getActionLabel(
  action: TableActionId,
  dictionary: GameDictionary,
  copiedInvite: boolean,
  remainingUndoRequests: number,
  secondsLeft: number
): string {
  const labels = dictionary.room;

  switch (action) {
    case "allow-undo":
      return labels.allowUndo;
    case "copy-invite":
      return copiedInvite ? labels.copied : labels.copyInvite;
    case "cancel-wait":
      return labels.cancelWaiting;
    case "leave":
      return labels.leaveRoom;
    case "ready":
      return labels.readyAction;
    case "reject-undo":
      return labels.rejectUndo.replace("{seconds}", String(secondsLeft));
    case "resign":
      return labels.resign;
    case "replay":
      return labels.reviewGame;
    case "rematch-cancel":
      return labels.cancelRematch;
    case "rematch-ready":
      return labels.rematch;
    case "sit":
      return labels.sitDown;
    case "undo":
      return `${dictionary.controls.undo} (${remainingUndoRequests})`;
    case "unready":
      return labels.unready;
  }
}

function getActionTone(action: TableActionId): "danger" | "success" | null {
  if (action === "allow-undo" || action === "ready" || action === "rematch-ready" || action === "sit") {
    return "success";
  }

  if (action === "cancel-wait" || action === "reject-undo" || action === "resign" || action === "unready") {
    return "danger";
  }

  return null;
}
