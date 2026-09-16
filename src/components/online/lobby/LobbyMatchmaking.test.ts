import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { dictionaries } from "@/i18n/dictionaries";
import { LobbyMatchmaking } from "./LobbyMatchmaking";
import type { FriendRoomController } from "../../useFriendRoom";

function createMockRoomController(): FriendRoomController {
  return {
    canCreateRoom: true,
    canFindMatch: true,
    canJoinRoom: true,
    createRoom: vi.fn(),
    findMatch: vi.fn(),
    joinRoom: vi.fn(),
    joinTarget: "",
    matchmakingStatus: "idle",
    setJoinTarget: vi.fn()
  } as unknown as FriendRoomController;
}

describe("LobbyMatchmaking", () => {
  it("renders separated create and join cards with accessible markup and no dead keys", () => {
    const dictionary = dictionaries.en.game;
    const room = createMockRoomController();
    const html = renderToString(
      React.createElement(LobbyMatchmaking, {
        dictionary,
        isFriendsOpen: true,
        onToggleFriends: vi.fn(),
        room
      })
    );

    // 1. Both cards and divider exist
    expect(html).toContain('class="lobby-friend-create-card"');
    expect(html).toContain('class="lobby-friend-divider"');
    expect(html).toContain('class="lobby-friend-join-card"');

    // 2. Dead key resolution: labels.joinExistingRoom is actively rendered
    expect(html).toContain(dictionary.room.joinExistingRoom);
    expect(html).toContain('class="lobby-friend-subtitle"');

    // 3. Accessibility: create button has aria-describedby pointing to the hint's id
    const createBtnMatch = html.match(/<button\b([^>]*data-lobby-action="create-unlisted"[^>]*)>/);
    expect(createBtnMatch).toBeTruthy();
    const btnAttrs = createBtnMatch![1];
    const describedByMatch = btnAttrs.match(/aria-describedby="([^"]+)"/);
    expect(describedByMatch).toBeTruthy();
    const hintId = describedByMatch![1];
    expect(html).toContain(`id="${hintId}"`);
    expect(html).toContain('class="lobby-friend-hint"');
    expect(html).toContain(dictionary.room.createUnlistedRoomHint);

    // 4. Accessibility: join heading id matches form aria-labelledby (h2 heading level)
    const headingMatch = html.match(/<h2[^>]*class="lobby-friend-subtitle"[^>]*id="([^"]+)"/);
    expect(headingMatch).toBeTruthy();
    const headingId = headingMatch![1];
    expect(html).toContain(`aria-labelledby="${headingId}"`);

    // 5. Accessibility: divider is visual separator with aria-hidden="true" and connector text
    const dividerMatch = html.match(/<div class="lobby-friend-divider" aria-hidden="true"><span>([^<]*)<\/span><\/div>/);
    expect(dividerMatch).toBeTruthy();
    expect(dividerMatch![1]).toBe(dictionary.room.orJoinExisting);

    // 6. DOM Order: create button appears before divider, which appears before join input
    const createBtnIndex = html.indexOf('data-lobby-action="create-unlisted"');
    const dividerIndex = html.indexOf('class="lobby-friend-divider"');
    const inputIndex = html.indexOf('placeholder="https://… / ABC123 / @alice"');
    expect(createBtnIndex).toBeLessThan(dividerIndex);
    expect(dividerIndex).toBeLessThan(inputIndex);
  });

  it("renders in other locales without missing keys or structural issues", () => {
    for (const locale of ["en", "zh", "fr", "es", "ru", "ar"] as const) {
      const dictionary = dictionaries[locale].game;
      const room = createMockRoomController();
      const html = renderToString(
        React.createElement(LobbyMatchmaking, {
          dictionary,
          isFriendsOpen: true,
          onToggleFriends: vi.fn(),
          room
        })
      );
      const hintMatch = html.match(/<p class="lobby-friend-hint"[^>]*>([^<]*)<\/p>/);
      expect(hintMatch).toBeTruthy();
      expect(hintMatch![1].replace(/&#x27;/g, "'")).toBe(dictionary.room.createUnlistedRoomHint);

      const headingMatch = html.match(/<h2 class="lobby-friend-subtitle"[^>]*>([^<]*)<\/h2>/);
      expect(headingMatch).toBeTruthy();
      expect(headingMatch![1].replace(/&#x27;/g, "'")).toBe(dictionary.room.joinExistingRoom);

      const dividerMatch = html.match(/<div class="lobby-friend-divider" aria-hidden="true"><span>([^<]*)<\/span><\/div>/);
      expect(dividerMatch).toBeTruthy();
      expect(dividerMatch![1].replace(/&#x27;/g, "'")).toBe(dictionary.room.orJoinExisting);
    }
  });

  it("does not render friends panel when isFriendsOpen is false", () => {
    const dictionary = dictionaries.en.game;
    const room = createMockRoomController();
    const html = renderToString(
      React.createElement(LobbyMatchmaking, {
        dictionary,
        isFriendsOpen: false,
        onToggleFriends: vi.fn(),
        room
      })
    );
    expect(html).not.toContain('class="lobby-friend-create-card"');
    expect(html).not.toContain('class="lobby-friend-join-card"');
  });
});
