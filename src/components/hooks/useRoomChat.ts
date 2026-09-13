"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomAck, RoomClientState, PublicChatAck } from "@/server/room-contract";
import type { PublicChatMessage } from "@/server/rooms";
import { createChatSendGate, type ChatSendGate } from "../chat-send-gate";
import {
  DEFAULT_CHAT_SEND_TIMEOUT_ERROR,
  isPublicChatSnapshot,
  persistPlayerName,
  type PlayerAuthPayload,
  type RoomSocket,
  type UseFriendRoomOptions
} from "./room-state-utils";

export type UseRoomChatProps = {
  room: RoomClientState | null;
  identityReady: boolean;
  messages?: UseFriendRoomOptions["messages"];
  ensureSocket: () => RoomSocket;
  getActivePlayer: () => PlayerAuthPayload;
  applyRoomAck: (response: RoomAck) => void;
  setError: (error: string | null) => void;
  setPlayerNameState: (name: string) => void;
};

export function useRoomChat({
  room,
  identityReady,
  messages,
  ensureSocket,
  getActivePlayer,
  applyRoomAck,
  setError,
  setPlayerNameState
}: UseRoomChatProps) {
  const [chatText, setChatText] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [publicChatMessages, setPublicChatMessages] = useState<PublicChatMessage[]>([]);
  const [publicChatStatus, setPublicChatStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [publicChatText, setPublicChatText] = useState("");
  const [isSendingPublicChat, setIsSendingPublicChat] = useState(false);

  const chatSendGateRef = useRef<ChatSendGate | null>(null);
  const publicChatSendGateRef = useRef<ChatSendGate | null>(null);

  const handlePublicChatMessages = useCallback((snapshot: unknown) => {
    if (isPublicChatSnapshot(snapshot)) {
      setPublicChatMessages(snapshot.messages);
      setPublicChatStatus("ready");
    }
  }, []);

  const refreshPublicChat = useCallback(() => {
    setPublicChatStatus("loading");
    ensureSocket().emit("public-chat:join", undefined, (response: PublicChatAck) => {
      if (!response.ok) {
        setPublicChatStatus("error");
        setError(response.error.message);
        return;
      }

      setPublicChatMessages(response.value.messages);
      setPublicChatStatus("ready");
    });
  }, [ensureSocket, setError]);

  const sendChatMessage = useCallback(() => {
    if (!room) {
      return;
    }

    const text = chatText.trim();

    if (!text) {
      return;
    }

    const gate = (chatSendGateRef.current ??= createChatSendGate());

    if (
      !gate.begin(() => {
        setIsSendingChat(false);
        setError(messages?.chatSendTimeout ?? DEFAULT_CHAT_SEND_TIMEOUT_ERROR);
        setChatText((current) => (current ? current : text));
      })
    ) {
      return;
    }

    setIsSendingChat(true);
    setChatText("");

    ensureSocket().emit("room:chat-send", { roomCode: room.snapshot.code, text }, (response: RoomAck) => {
      gate.settle();
      setIsSendingChat(false);
      applyRoomAck(response);

      if (!response.ok) {
        setChatText((current) => (current ? current : text));
      }
    });
  }, [applyRoomAck, chatText, ensureSocket, messages?.chatSendTimeout, room, setError]);

  const sendPublicChatMessage = useCallback(() => {
    if (!identityReady) {
      return;
    }

    const text = publicChatText.trim();

    if (!text) {
      return;
    }

    const player = getActivePlayer();
    const gate = (publicChatSendGateRef.current ??= createChatSendGate());

    if (
      !gate.begin(() => {
        setIsSendingPublicChat(false);
        setError(messages?.chatSendTimeout ?? DEFAULT_CHAT_SEND_TIMEOUT_ERROR);
        setPublicChatText((current) => (current ? current : text));
      })
    ) {
      return;
    }

    setIsSendingPublicChat(true);
    setPlayerNameState(player.playerName);
    persistPlayerName(player.playerName);
    setPublicChatText("");

    ensureSocket().emit(
      "public-chat:send",
      { ...player, text },
      (response: PublicChatAck) => {
        gate.settle();
        setIsSendingPublicChat(false);

        if (!response.ok) {
          setError(response.error.message);
          setPublicChatText((current) => (current ? current : text));
          return;
        }

        setPublicChatMessages(response.value.messages);
        setPublicChatStatus("ready");
        setError(null);
      }
    );
  }, [ensureSocket, getActivePlayer, identityReady, messages?.chatSendTimeout, publicChatText, setError, setPlayerNameState]);

  useEffect(() => {
    return () => {
      chatSendGateRef.current?.settle();
      publicChatSendGateRef.current?.settle();
    };
  }, []);

  const resetChatOnRoomClosed = useCallback(() => {
    setChatText("");
  }, []);

  return {
    chatText,
    setChatText,
    isSendingChat,
    sendChatMessage,
    publicChatMessages,
    publicChatStatus,
    publicChatText,
    setPublicChatText,
    isSendingPublicChat,
    sendPublicChatMessage,
    refreshPublicChat,
    handlePublicChatMessages,
    resetChatOnRoomClosed
  };
}
