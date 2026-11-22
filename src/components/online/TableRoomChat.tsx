"use client";

import { Send } from "lucide-react";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { formatChatMessageTime } from "@/lib/date-format";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/constants";
import type { FriendRoomController } from "../useFriendRoom";
import { useOptionalRoomContext } from "./RoomContext";

type TableRoomChatProps = {
  dictionary: GameDictionary;
  locale: Locale;
  room?: FriendRoomController;
};

export function TableRoomChat({ dictionary, locale, room: roomProp }: TableRoomChatProps) {
  const room = useOptionalRoomContext(roomProp);
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
                <span>{formatChatMessageTime(message.sentAt, locale)}</span>
              </div>
              <p>{message.text}</p>
            </div>
          ))
        ) : (
          <p className="room-message">{labels.noMessages}</p>
        )}
      </div>
      <form
        aria-busy={room.isSendingChat}
        className="room-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          room.sendChatMessage();
        }}
      >
        <input
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          onChange={(event) => room.setChatText(event.target.value)}
          placeholder={labels.chatPlaceholder}
          type="text"
          value={room.chatText}
        />
        <button
          className="icon-button"
          disabled={room.isSendingChat || !room.chatText.trim()}
          title={labels.sendMessage}
          type="submit"
        >
          <Send aria-hidden="true" focusable={false} />
        </button>
      </form>
    </section>
  );
}
