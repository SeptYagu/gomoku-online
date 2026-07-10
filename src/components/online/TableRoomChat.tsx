"use client";

import { Send } from "lucide-react";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { FriendRoomController } from "../useFriendRoom";

type TableRoomChatProps = {
  dictionary: GameDictionary;
  room: FriendRoomController;
};

export function TableRoomChat({ dictionary, room }: TableRoomChatProps) {
  const labels = dictionary.room;
  const messages = room.room?.snapshot.chatMessages ?? [];

  return (
    <section aria-label={labels.roomChat} className="room-chat table-room-chat">
      <div aria-live="polite" className="room-chat-list" role="log">
        {messages.length > 0 ? (
          messages.map((message) => (
            <div className="room-chat-message" key={message.id}>
              <div className="room-chat-meta">
                <strong>{message.name}</strong>
                <span>{formatChatMessageTime(message.sentAt)}</span>
              </div>
              <p>{message.text}</p>
            </div>
          ))
        ) : (
          <p className="room-message">{labels.noMessages}</p>
        )}
      </div>
      <form
        className="room-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          room.sendChatMessage();
        }}
      >
        <input
          maxLength={160}
          onChange={(event) => room.setChatText(event.target.value)}
          placeholder={labels.chatPlaceholder}
          type="text"
          value={room.chatText}
        />
        <button
          className="icon-button"
          disabled={!room.chatText.trim()}
          title={labels.sendMessage}
          type="submit"
        >
          <Send aria-hidden="true" focusable={false} />
        </button>
      </form>
    </section>
  );
}

function formatChatMessageTime(sentAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(sentAt));
}
