"use client";

import { useEffect } from "react";
import { Send } from "lucide-react";
import type { GameDictionary } from "@/i18n/dictionaries";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/constants";
import { formatChatMessageTime } from "@/lib/date-format";
import { useOptionalRoomContext } from "../RoomContext";
import type { FriendRoomController } from "../../useFriendRoom";

export type LobbyPublicChatProps = {
  dictionary: GameDictionary;
  room?: FriendRoomController;
};

export function LobbyPublicChat({ dictionary, room: roomProp }: LobbyPublicChatProps) {
  const room = useOptionalRoomContext(roomProp);
  const labels = dictionary.room;
  const { refreshPublicChat } = room;

  useEffect(() => {
    refreshPublicChat();
  }, [refreshPublicChat]);

  return (
    <section aria-label={labels.publicChat} className="room-chat public-chat">
      <div className="room-chat-header">
        <p className="metric-label">{labels.publicChat}</p>
      </div>
      <div aria-live="polite" className="room-chat-list" role="log">
        {room.publicChatMessages.length > 0 ? (
          room.publicChatMessages.map((message) => (
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
        aria-busy={room.isSendingPublicChat}
        className="room-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          room.sendPublicChatMessage();
        }}
      >
        <input
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          onChange={(event) => room.setPublicChatText(event.target.value)}
          placeholder={labels.publicChatPlaceholder}
          type="text"
          value={room.publicChatText}
        />
        <button
          className="icon-button"
          disabled={
            room.accountStatus === "loading" || room.isSendingPublicChat || !room.publicChatText.trim()
          }
          title={labels.sendMessage}
          type="submit"
        >
          <Send aria-hidden="true" focusable={false} />
        </button>
      </form>
    </section>
  );
}

// Backward compatibility alias
export const PublicChatPanel = LobbyPublicChat;
