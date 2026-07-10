"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

type InteractionConfirmationProps = {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
};

export function InteractionConfirmation({
  cancelLabel,
  confirmLabel,
  description,
  isSubmitting = false,
  onCancel,
  onConfirm,
  title
}: InteractionConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <section
      aria-describedby="interaction-confirmation-description"
      aria-labelledby="interaction-confirmation-title"
      className="interaction-confirmation"
      data-interaction-confirmation
      role="alertdialog"
    >
      <AlertTriangle aria-hidden="true" focusable={false} />
      <div className="interaction-confirmation-copy">
        <strong id="interaction-confirmation-title">{title}</strong>
        <p id="interaction-confirmation-description">{description}</p>
      </div>
      <div className="interaction-confirmation-actions">
        <button className="mode-pill" disabled={isSubmitting} onClick={onCancel} ref={cancelRef} type="button">
          {cancelLabel}
        </button>
        <button className="mode-pill danger" disabled={isSubmitting} onClick={onConfirm} type="button">
          {confirmLabel}
        </button>
      </div>
    </section>
  );
}
