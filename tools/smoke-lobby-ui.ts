import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { io } from "socket.io-client";

import type { RoomAck } from "../src/server/room-contract";

type BrowserTarget = {
  webSocketDebuggerUrl?: string;
};

type CdpMessage = {
  error?: {
    message?: string;
  };
  id?: number;
  result?: unknown;
};

type PendingCommand = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

type RuntimeEvaluateResult = {
  exceptionDetails?: unknown;
  result?: {
    value?: unknown;
  };
};

type SmokeSocket = {
  disconnect: () => void;
  emit: (event: string, ...args: unknown[]) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
};

type PreparedRooms = {
  cleanup: () => void;
  playingCode: string;
  waitingCode: string;
  waitingHost: SmokeSocket;
};

type ClickResult = {
  detail: string;
  ok: boolean;
};

const DEFAULT_BASE_URL = "http://gomoku.yagu.ddns-ip.net";
const START_TIMEOUT_MS = 15_000;
const STEP_TIMEOUT_MS = 20_000;

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? DEFAULT_BASE_URL);
  const baseOrigin = new URL(baseUrl).origin;
  let preparedRooms: PreparedRooms | null = null;
  const chromePath = findChromePath();
  const port = await getFreePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), "gomoku-lobby-ui-smoke-"));
  const chrome = launchChrome(chromePath, port, userDataDir, baseOrigin);

  try {
    await waitForChrome(port);
    const targetUrl = await openBrowserTarget(port, new URL("/en", `${baseUrl}/`).toString());
    const cdp = await CdpClient.connect(targetUrl);

    try {
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      await waitForRuntime(cdp);
      await assertNoRealtimeConnection(cdp, "local");
      await clickButton(cdp, "AI");
      await assertNoRealtimeConnection(cdp, "AI");
      await exerciseAiSettingsAndModeGuard(cdp);
      await clickButton(cdp, "Friend room");
      await waitForOnlineView(cdp, "lobby");
      await assertOnlineWorkspaceIsolation(cdp, "lobby");
      await assertLobbyEntryHierarchy(cdp);
      await clickButton(cdp, "Find match");
      await waitForOnlineView(cdp, "table");
      await waitForTableState(cdp, "seated-waiting-opponent");
      await assertTableTaskModel(cdp, "seated-waiting-opponent", ["Cancel waiting"]);
      await clickButton(cdp, "Cancel waiting");
      await waitForNoRoomUrl(cdp);
      await waitForOnlineView(cdp, "lobby");

      preparedRooms = await prepareRooms(baseUrl);
      await clickLobbySection(cdp, "progress");
      await assertLeaderboardSearchSubmit(cdp);
      await clickLobbySection(cdp, "progress");

      await waitForBodyText(cdp, preparedRooms.waitingCode);
      await assertLobbyRowContains(cdp, preparedRooms.waitingCode, "Join room");
      await assertLobbyRoomGroup(cdp, preparedRooms.waitingCode, "joinable");
      await clickLobbySection(cdp, "friends");
      await setFriendRoomCode(cdp, preparedRooms.waitingCode);
      await clickButton(cdp, "Join room");
      await waitForRoomUrl(cdp, preparedRooms.waitingCode);
      await waitForOnlineView(cdp, "table");
      await assertOnlineWorkspaceIsolation(cdp, "table");
      await waitForTableState(cdp, "seated-not-ready");
      await assertTableTaskModel(cdp, "seated-not-ready", ["Ready"]);
      await clickButton(cdp, "Ready");
      await waitForTableState(cdp, "seated-ready");
      const startedRoom = requireOk(
        await emitAck(preparedRooms.waitingHost, "room:ready", {
          ready: true,
          roomCode: preparedRooms.waitingCode
        }),
        "waiting host ready"
      ).snapshot;
      await waitForTableState(cdp, "playing-opponent-turn");
      const movedRoom = requireOk(
        await emitAck(preparedRooms.waitingHost, "game:move", {
          expectedMoveSeq: startedRoom.moveSeq,
          point: { col: 7, row: 7 },
          roomCode: preparedRooms.waitingCode
        }),
        "waiting host move"
      ).snapshot;
      await waitForTableState(cdp, "playing-my-turn");
      await assertPlayableAtLowHeight(cdp);
      requireOk(
        await emitAck(preparedRooms.waitingHost, "game:undo-request", {
          roomCode: movedRoom.code
        }),
        "waiting host undo request"
      );
      await waitForTableState(cdp, "undo-response-required");
      await assertTableTaskModel(cdp, "undo-response-required", ["Reject", "Allow"]);
      await assertSidebarTabs(cdp, preparedRooms.waitingCode);
      await assertUndoLayoutAtTargetViewports(cdp);
      await clickButton(cdp, "Allow");
      await waitForTableState(cdp, "playing-opponent-turn");
      const replayableRoom = requireOk(
        await emitAck(preparedRooms.waitingHost, "game:move", {
          expectedMoveSeq: 0,
          point: { col: 6, row: 7 },
          roomCode: preparedRooms.waitingCode
        }),
        "waiting host replayable move"
      ).snapshot;
      if (replayableRoom.moveSeq !== 1) {
        throw new Error(`Expected one replayable move before resign, received ${replayableRoom.moveSeq}`);
      }
      await waitForTableState(cdp, "playing-my-turn");
      requireOk(
        await emitAck(preparedRooms.waitingHost, "game:resign", { roomCode: preparedRooms.waitingCode }),
        "waiting host resign before rematch"
      );
      await waitForTableState(cdp, "finished-rematch-open");
      await assertTableTaskModel(cdp, "finished-rematch-open", ["Play again"]);
      await captureEvidence(cdp, "rematch-open.png");
      await clickTableAction(cdp, "replay");
      await assertReplayFrame(cdp, `${preparedRooms.waitingCode}-1`, 1, 1, "finished-rematch-open");
      await clickReplayControl(cdp, "previous");
      await assertReplayFrame(cdp, `${preparedRooms.waitingCode}-1`, 0, 0, "finished-rematch-open");
      await clickReplayControl(cdp, "next");
      await assertReplayFrame(cdp, `${preparedRooms.waitingCode}-1`, 1, 1, "finished-rematch-open");
      await captureEvidence(cdp, "terminal-replay.png");
      await clickReplayExit(cdp);
      await waitForTableState(cdp, "finished-rematch-open");
      await assertTableTaskModel(cdp, "finished-rematch-open", ["Play again"]);
      await clickButton(cdp, "Play again");
      await waitForTableState(cdp, "finished-rematch-ready");
      await assertTableTaskModel(cdp, "finished-rematch-ready", ["Cancel rematch"]);
      await captureEvidence(cdp, "rematch-ready.png");
      requireOk(
        await emitAck(preparedRooms.waitingHost, "game:rematch-ready", {
          ready: true,
          roomCode: preparedRooms.waitingCode
        }),
        "waiting host rematch ready"
      );
      await waitForTableState(cdp, "playing-my-turn");
      await assertTableTaskModel(cdp, "playing-my-turn", []);
      await navigateToLocaleTable(cdp, baseUrl, "ar", preparedRooms.waitingCode);
      await waitForPlayingTable(cdp);
      await clickGameMode(cdp, "ai");
      await assertRtlMobileConfirmation(cdp);
      await clickConfirmationButton(cdp, "cancel");
      await navigateToLocaleTable(cdp, baseUrl, "en", preparedRooms.waitingCode);
      await waitForPlayingTable(cdp);
      await assertPreviousGameReplay(cdp, `${preparedRooms.waitingCode}-1`);
      await captureEvidence(cdp, "previous-game-replay.png");
      await clickReplayExit(cdp);
      await waitForPlayingTable(cdp);
      await clickButton(cdp, "AI");
      await assertInteractionConfirmation(cdp, "60 seconds", true);
      await captureEvidence(cdp, "online-mode-switch-confirmation.png");
      await clickConfirmationButton(cdp, "cancel");
      await waitForTableState(cdp, "playing-my-turn");
      await clickTableAction(cdp, "leave");
      await assertInteractionConfirmation(cdp, "60 seconds", true);
      await clickConfirmationButton(cdp, "confirm");
      await waitForNoRoomUrl(cdp);
      await waitForOnlineView(cdp, "lobby");
      await assertOnlineWorkspaceIsolation(cdp, "lobby");

      await waitForBodyText(cdp, preparedRooms.playingCode);
      await assertLobbyRowContains(cdp, preparedRooms.playingCode, "Watch");
      await assertLobbyRoomGroup(cdp, preparedRooms.playingCode, "watchable");
      await clickLobbyRoomButton(cdp, preparedRooms.playingCode);
      await waitForRoomUrl(cdp, preparedRooms.playingCode);
      await waitForOnlineView(cdp, "table");
      await assertOnlineWorkspaceIsolation(cdp, "table");
      await waitForBodyText(cdp, "Spectator");
      await waitForTableState(cdp, "spectating");
      await assertTableTaskModel(cdp, "spectating", []);
      await navigateToLocaleTable(cdp, baseUrl, "ar", preparedRooms.playingCode);
      await waitForTableState(cdp, "spectating");
      await assertRtlMobileTable(cdp);
      await clickTableAction(cdp, "leave");
      await waitForOnlineView(cdp, "lobby");
      await assertRtlMobileLobby(cdp);

      console.log(`Lobby UI smoke: ${baseUrl}`);
      console.log("PASS local and AI workspaces do not create a realtime connection");
      console.log("PASS AI settings defer to the next game and active AI mode switches require confirmation");
      console.log("PASS quick match is the one-click primary action and solo waiting can be cancelled");
      console.log("PASS friends, identity, community, and progress use progressive disclosure");
      console.log("PASS manual friend join needs one disclosure, one room code, and one submit");
      console.log("PASS leaderboard search has an explicit submit button");
      console.log(`PASS lobby waiting row is joinable - ${preparedRooms.waitingCode}`);
      console.log(`PASS lobby playing row is watchable - ${preparedRooms.playingCode}`);
      console.log("PASS online lobby and table are mutually exclusive");
      console.log("PASS table tasks are state-driven, non-blocking, and limited to four actions");
      console.log("PASS terminal and post-rematch records replay move-by-move on the readonly table board");
      console.log("PASS the previous authoritative game remains available after locale refresh and rejoin");
      console.log("PASS both players choose rematch before one immediate next game starts");
      console.log("PASS active online mode switches and explicit table exit explain the disconnect grace period");
      console.log("PASS confirmation controls remain operable at 390x844 RTL");
      console.log("PASS undo decisions and board remain visible at 1440x900, 1280x720, and 390x844");
      console.log("PASS 1280x720 can play without scrolling and 390x844 Arabic preserves table and lobby order");
    } finally {
      cdp.close();
    }
  } finally {
    preparedRooms?.cleanup();
    chrome.kill();
    await waitForProcessExit(chrome);
    await rm(userDataDir, { force: true, maxRetries: 10, recursive: true, retryDelay: 250 });
  }
}

async function exerciseAiSettingsAndModeGuard(cdp: CdpClient): Promise<void> {
  await waitForPlayView(cdp, "ai");
  await clickBoardPoint(cdp, "7:7");
  await waitForStoneCount(cdp, 2);
  await clickButton(cdp, "Expert");
  await clickButton(cdp, "AI first");
  await waitForValue(async () => {
    const pending = await evaluate<{ stones: number; text: string | null }>(
      cdp,
      `({
        stones: document.querySelectorAll('[data-play-view="ai"] .stone').length,
        text: document.querySelector('[data-ai-pending-settings]')?.textContent ?? null
      })`
    );

    return pending.stones === 2 && pending.text?.includes("Next game: AI first · Expert") ? pending : null;
  }, STEP_TIMEOUT_MS);
  await captureEvidence(cdp, "ai-settings-next-game.png");
  await clickButton(cdp, "New game");
  await waitForValue(async () => {
    const state = await evaluate<{ aiFirstActive: boolean; expertActive: boolean; hasPending: boolean; stones: number }>(
      cdp,
      `(() => {
        const buttons = Array.from(document.querySelectorAll('[data-play-view="ai"] button'));
        const expert = buttons.find((button) => (button.textContent || '').trim() === 'Expert');
        const aiFirst = buttons.find((button) => (button.textContent || '').trim() === 'AI first');
        return {
          aiFirstActive: Boolean(aiFirst?.classList.contains('active')),
          expertActive: Boolean(expert?.classList.contains('active')),
          hasPending: Boolean(document.querySelector('[data-ai-pending-settings]')),
          stones: document.querySelectorAll('[data-play-view="ai"] .stone').length
        };
      })()`
    );

    return state.aiFirstActive && state.expertActive && !state.hasPending && state.stones === 1 ? state : null;
  }, STEP_TIMEOUT_MS);

  await clickFirstEnabledBoardPoint(cdp);
  await waitForStoneCount(cdp, 3);
  await clickButton(cdp, "Local two-player");
  await assertInteractionConfirmation(cdp, "current AI position", true);
  await captureEvidence(cdp, "ai-mode-switch-confirmation.png");
  await pressEnter(cdp);
  await waitForPlayView(cdp, "ai");
  await waitForStoneCount(cdp, 3);
  await clickButton(cdp, "Local two-player");
  await assertInteractionConfirmation(cdp, "current AI position", true);
  await clickConfirmationButton(cdp, "confirm");
  await waitForPlayView(cdp, "local");
}

async function waitForPlayView(cdp: CdpClient, view: "ai" | "local"): Promise<void> {
  await waitForValue(async () => {
    const found = await evaluate<boolean>(cdp, `Boolean(document.querySelector('[data-play-view="${view}"]'))`);

    return found ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function clickBoardPoint(cdp: CdpClient, point: string): Promise<void> {
  const result = await evaluate<ClickResult>(
    cdp,
    `(() => {
      const point = document.querySelector('[data-board-point="${point}"]');
      if (!(point instanceof HTMLButtonElement) || point.disabled) {
        return { ok: false, detail: document.body.innerText };
      }
      point.click();
      return { ok: true, detail: point.getAttribute('data-board-point') || '' };
    })()`
  );

  if (!result.ok) {
    throw new Error(`Could not click board point ${point}: ${result.detail}`);
  }
}

async function clickFirstEnabledBoardPoint(cdp: CdpClient): Promise<void> {
  const result = await evaluate<ClickResult>(
    cdp,
    `(() => {
      const point = document.querySelector('[data-play-view="ai"] .board-point:not(:disabled)');
      if (!(point instanceof HTMLButtonElement)) {
        return { ok: false, detail: document.body.innerText };
      }
      point.click();
      return { ok: true, detail: point.getAttribute('data-board-point') || '' };
    })()`
  );

  if (!result.ok) {
    throw new Error(`Could not click an enabled AI board point: ${result.detail}`);
  }
}

async function waitForStoneCount(cdp: CdpClient, count: number): Promise<void> {
  await waitForValue(async () => {
    const stones = await evaluate<number>(cdp, `document.querySelectorAll('.stone').length`);

    return stones === count ? stones : null;
  }, STEP_TIMEOUT_MS);
}

async function assertInteractionConfirmation(
  cdp: CdpClient,
  expectedDescription: string,
  expectBoard: boolean
): Promise<void> {
  const result = await waitForValue(async () => {
    const current = await evaluate<{
      activeText: string;
      boardVisible: boolean;
      description: string;
      hasCancel: boolean;
      hasConfirm: boolean;
    }>(
      cdp,
      `(() => {
        const panel = document.querySelector('[data-interaction-confirmation]');
        const buttons = Array.from(panel?.querySelectorAll('button') ?? []);
        return {
          activeText: (document.activeElement?.textContent || '').trim(),
          boardVisible: Boolean(document.querySelector('.play-area .board-wrap')),
          description: panel?.textContent || '',
          hasCancel: buttons.length === 2,
          hasConfirm: buttons.some((button) => button.classList.contains('danger'))
        };
      })()`
    );

    return current.description.includes(expectedDescription) ? current : null;
  }, STEP_TIMEOUT_MS);

  if (
    result.activeText !== "Cancel" ||
    result.boardVisible !== expectBoard ||
    !result.hasCancel ||
    !result.hasConfirm
  ) {
    throw new Error(`Interaction confirmation failed: ${JSON.stringify(result)}`);
  }
}

async function clickConfirmationButton(cdp: CdpClient, action: "cancel" | "confirm"): Promise<void> {
  const selector = action === "confirm" ? ".mode-pill.danger" : ".mode-pill:not(.danger)";
  const result = await evaluate<ClickResult>(
    cdp,
    `(() => {
      const button = document.querySelector('[data-interaction-confirmation] ${selector}');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, detail: document.body.innerText };
      }
      button.click();
      return { ok: true, detail: (button.textContent || '').trim() };
    })()`
  );

  if (!result.ok) {
    throw new Error(`Could not ${action} interaction confirmation: ${result.detail}`);
  }
}

async function clickGameMode(cdp: CdpClient, mode: "ai" | "local" | "room"): Promise<void> {
  const result = await evaluate<ClickResult>(
    cdp,
    `(() => {
      const button = document.querySelector('[data-game-mode="${mode}"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, detail: document.body.innerText };
      }
      button.click();
      return { ok: true, detail: (button.textContent || '').trim() };
    })()`
  );

  if (!result.ok) {
    throw new Error(`Could not choose ${mode} mode: ${result.detail}`);
  }
}

async function assertRtlMobileConfirmation(cdp: CdpClient): Promise<void> {
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 844,
      mobile: false,
      width: 390
    });
    const result = await waitForValue(async () => {
      const current = await evaluate<{
        boardPresent: boolean;
        buttonsLargeEnough: boolean;
        cancelFocused: boolean;
        direction: string;
        noHorizontalOverflow: boolean;
        panelVisible: boolean;
        viewport: { height: number; width: number };
      }>(
        cdp,
        `(() => {
          const panel = document.querySelector('[data-interaction-confirmation]');
          panel?.scrollIntoView({ block: 'start' });
          const panelRect = panel?.getBoundingClientRect();
          const buttons = Array.from(panel?.querySelectorAll('button') ?? []);
          return {
            boardPresent: Boolean(document.querySelector('.play-area .board-wrap')),
            buttonsLargeEnough: buttons.length === 2 && buttons.every((button) => {
              const rect = button.getBoundingClientRect();
              return rect.width >= 44 && rect.height >= 44;
            }),
            cancelFocused: document.activeElement === buttons[0],
            direction: document.documentElement.dir,
            noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
            panelVisible: Boolean(panelRect && panelRect.top >= 0 && panelRect.bottom <= window.innerHeight),
            viewport: { height: window.innerHeight, width: window.innerWidth }
          };
        })()`
      );

      return current.viewport.width === 390 && current.viewport.height === 844 ? current : null;
    }, STEP_TIMEOUT_MS);

    if (
      result.direction !== "rtl" ||
      !result.noHorizontalOverflow ||
      !result.panelVisible ||
      !result.buttonsLargeEnough ||
      !result.cancelFocused ||
      !result.boardPresent
    ) {
      throw new Error(`RTL mobile confirmation failed: ${JSON.stringify(result)}`);
    }

    await captureCurrentViewport(cdp, "confirmation-rtl-390x844.png");
  } finally {
    await cdp.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function captureCurrentViewport(cdp: CdpClient, fileName: string): Promise<void> {
  const captureDir = process.env.GOMOKU_SMOKE_CAPTURE_DIR;

  if (!captureDir) {
    return;
  }

  await cdp.send("Page.bringToFront");
  await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 300))))",
    returnByValue: true
  });
  await mkdir(captureDir, { recursive: true });
  const screenshot = (await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true })) as {
    data?: string;
  };

  if (!screenshot.data) {
    throw new Error(`Chrome did not return screenshot ${fileName}`);
  }

  await writeFile(path.join(captureDir, fileName), Buffer.from(screenshot.data, "base64"));
}

async function pressEnter(cdp: CdpClient): Promise<void> {
  await cdp.send("Input.dispatchKeyEvent", { code: "Enter", key: "Enter", type: "keyDown", windowsVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { code: "Enter", key: "Enter", type: "keyUp", windowsVirtualKeyCode: 13 });
}

async function captureEvidence(cdp: CdpClient, fileName: string): Promise<void> {
  const captureDir = process.env.GOMOKU_SMOKE_CAPTURE_DIR;

  if (!captureDir) {
    return;
  }

  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 720,
      mobile: false,
      width: 1280
    });
    await waitForValue(async () => {
      const viewport = await evaluate<{ height: number; width: number }>(
        cdp,
        `(() => {
          const target = document.querySelector('[data-interaction-confirmation]') ?? document.querySelector('[data-online-view="table"]');
          target?.scrollIntoView({ block: 'start' });
          return { height: window.innerHeight, width: window.innerWidth };
        })()`
      );

      return viewport.width === 1280 && viewport.height === 720 ? viewport : null;
    }, STEP_TIMEOUT_MS);
    await cdp.send("Page.bringToFront");
    await cdp.send("Runtime.evaluate", {
      awaitPromise: true,
      expression: "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 300))))",
      returnByValue: true
    });
    await mkdir(captureDir, { recursive: true });
    const screenshot = (await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true
    })) as { data?: string };

    if (!screenshot.data) {
      throw new Error(`Chrome did not return screenshot ${fileName}`);
    }

    await writeFile(path.join(captureDir, fileName), Buffer.from(screenshot.data, "base64"));
  } finally {
    await cdp.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function assertNoRealtimeConnection(cdp: CdpClient, workspace: "local" | "AI"): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const socketResources = await evaluate<string[]>(
    cdp,
    `performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("/socket.io"))`
  );

  if (socketResources.length > 0) {
    throw new Error(`${workspace} workspace opened a realtime connection: ${socketResources.join(", ")}`);
  }
}

async function assertLeaderboardSearchSubmit(cdp: CdpClient): Promise<void> {
  await waitForValue(async () => {
    const hasSubmit = await evaluate<boolean>(
      cdp,
      `Boolean(document.querySelector('.room-leaderboard-search input[type="search"]') && document.querySelector('.room-leaderboard-search button[type="submit"]'))`
    );

    return hasSubmit ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function waitForOnlineView(cdp: CdpClient, view: "lobby" | "table"): Promise<void> {
  await waitForValue(async () => {
    const found = await evaluate<boolean>(cdp, `Boolean(document.querySelector('[data-online-view="${view}"]'))`);

    return found ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function assertOnlineWorkspaceIsolation(cdp: CdpClient, expected: "lobby" | "table"): Promise<void> {
  const result = await evaluate<{
    hasLobbyOnlyContent: boolean;
    hasLobbyView: boolean;
    hasPlayArea: boolean;
    hasTableView: boolean;
  }>(
    cdp,
    `(() => ({
      hasLobbyOnlyContent: Boolean(document.querySelector('.room-lobby, .public-chat, .room-leaderboard, .room-presence')),
      hasLobbyView: Boolean(document.querySelector('[data-online-view="lobby"]')),
      hasPlayArea: Boolean(document.querySelector('[data-online-view="table"] .play-area')),
      hasTableView: Boolean(document.querySelector('[data-online-view="table"]'))
    }))()`
  );

  const isValid =
    expected === "lobby"
      ? result.hasLobbyView && result.hasLobbyOnlyContent && !result.hasTableView && !result.hasPlayArea
      : result.hasTableView && result.hasPlayArea && !result.hasLobbyView && !result.hasLobbyOnlyContent;

  if (!isValid) {
    throw new Error(`Online workspace isolation failed for ${expected}: ${JSON.stringify(result)}`);
  }
}

async function assertLobbyEntryHierarchy(cdp: CdpClient): Promise<void> {
  const result = await waitForValue(async () => {
    const current = await evaluate<{
      collapsedSections: boolean;
      emptyActions: string[];
      emptyNotice: string;
      friendCollapsed: boolean;
      primaryActionCount: number;
      primaryBeforeFriends: boolean;
    }>(
      cdp,
      `(() => {
        const primary = document.querySelector('[data-lobby-action="quick-match"]');
        const friends = document.querySelector('[data-lobby-section-toggle="friends"]');
        const empty = document.querySelector('[data-lobby-empty-state]');
        return {
          collapsedSections: document.querySelectorAll('[data-lobby-section]').length === 0 &&
            !document.querySelector('.room-field input, .public-chat, .room-presence, .room-leaderboard'),
          emptyActions: Array.from(empty?.querySelectorAll('button') ?? []).map((button) => (button.textContent || '').trim()),
          emptyNotice: empty?.querySelector('.room-message')?.textContent || '',
          friendCollapsed: friends?.getAttribute('aria-expanded') === 'false',
          primaryActionCount: document.querySelectorAll('[data-lobby-action="quick-match"]').length,
          primaryBeforeFriends: Boolean(primary && friends && (primary.compareDocumentPosition(friends) & Node.DOCUMENT_POSITION_FOLLOWING))
        };
      })()`
    );

    return current.emptyActions.length === 3 ? current : null;
  }, STEP_TIMEOUT_MS);
  const hasEmptyFallbacks = ["Find match", "Create unlisted room", "AI"].every((label) =>
    result.emptyActions.some((action) => action.includes(label))
  );

  if (
    !result.collapsedSections ||
    !result.friendCollapsed ||
    result.primaryActionCount !== 1 ||
    !result.primaryBeforeFriends ||
    !hasEmptyFallbacks ||
    !result.emptyNotice.includes("not access protection")
  ) {
    throw new Error(`Lobby entry hierarchy failed: ${JSON.stringify(result)}`);
  }
}

async function waitForTableState(cdp: CdpClient, state: string): Promise<void> {
  await waitForValue(async () => {
    const currentState = await evaluate<string | null>(
      cdp,
      `document.querySelector('[data-online-view="table"]')?.getAttribute('data-table-state') ?? null`
    );

    return currentState === state ? currentState : null;
  }, STEP_TIMEOUT_MS);
}

async function waitForPlayingTable(cdp: CdpClient): Promise<void> {
  try {
    await waitForValue(async () => {
      const state = await evaluate<string | null>(
        cdp,
        `document.querySelector('[data-online-view="table"]')?.getAttribute('data-table-state') ?? null`
      );

      return state === "playing-my-turn" || state === "playing-opponent-turn" ? state : null;
    }, STEP_TIMEOUT_MS);
  } catch {
    const detail = await evaluate<{ body: string; state: string | null; url: string }>(
      cdp,
      `({
        body: document.body.innerText,
        state: document.querySelector('[data-online-view="table"]')?.getAttribute('data-table-state') ?? null,
        url: window.location.href
      })`
    );
    throw new Error(`Playing table did not restore: ${JSON.stringify(detail)}`);
  }
}

async function assertTableTaskModel(cdp: CdpClient, expectedState: string, expectedTaskLabels: string[]): Promise<void> {
  const result = await evaluate<{
    disabledActions: number;
    hasBoard: boolean;
    hasBlockingModal: boolean;
    hasTaskBar: boolean;
    state: string | null;
    taskLabels: string[];
    totalActions: number;
  }>(
    cdp,
    `(() => {
      const table = document.querySelector('[data-online-view="table"]');
      const taskButtons = Array.from(table?.querySelectorAll('.table-task-actions button') ?? []);
      const toolbarButtons = Array.from(table?.querySelectorAll('.table-action-bar button') ?? []);
      const actions = [...taskButtons, ...toolbarButtons];
      return {
        disabledActions: actions.filter((button) => button.disabled).length,
        hasBoard: Boolean(table?.querySelector('.play-area .board-wrap')),
        hasBlockingModal: Boolean(table?.querySelector('.undo-request-modal, [aria-modal="true"]')),
        hasTaskBar: Boolean(table?.querySelector('.table-task-bar')),
        state: table?.getAttribute('data-table-state') ?? null,
        taskLabels: taskButtons.map((button) => (button.textContent || '').trim()),
        totalActions: actions.length
      };
    })()`
  );

  const hasExpectedLabels = expectedTaskLabels.every((label) =>
    result.taskLabels.some((buttonLabel) => buttonLabel.includes(label))
  );
  const isValid =
    result.state === expectedState &&
    result.hasTaskBar &&
    result.hasBoard &&
    !result.hasBlockingModal &&
    result.disabledActions === 0 &&
    result.totalActions <= 4 &&
    result.taskLabels.length <= 2 &&
    hasExpectedLabels;

  if (!isValid) {
    throw new Error(`Table task model failed for ${expectedState}: ${JSON.stringify(result)}`);
  }
}

async function assertSidebarTabs(cdp: CdpClient, roomCode: string): Promise<void> {
  await clickSidebarTab(cdp, "history");
  await waitForValue(async () => {
    const moveCount = await evaluate<number>(cdp, `document.querySelectorAll('.table-move-history li').length`);

    return moveCount === 1 ? moveCount : null;
  }, STEP_TIMEOUT_MS);

  await clickSidebarTab(cdp, "info");
  await waitForValue(async () => {
    const info = await evaluate<string | null>(cdp, `document.querySelector('.table-room-info')?.textContent ?? null`);

    return info?.includes(roomCode) ? info : null;
  }, STEP_TIMEOUT_MS);

  await clickSidebarTab(cdp, "chat");
  await waitForValue(async () => {
    const hasChat = await evaluate<boolean>(cdp, `Boolean(document.querySelector('.table-room-chat'))`);

    return hasChat ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function clickSidebarTab(cdp: CdpClient, tab: "chat" | "history" | "info"): Promise<void> {
  const result = await evaluate<{ count: number; ok: boolean }>(
    cdp,
    `(() => {
      const tabs = Array.from(document.querySelectorAll('[data-table-sidebar-tab="${tab}"]'));
      if (tabs.length === 1) {
        tabs[0].click();
      }
      return { count: tabs.length, ok: tabs.length === 1 };
    })()`
  );

  if (!result.ok) {
    throw new Error(`Sidebar tab ${tab} was not unique: ${result.count}`);
  }
}

async function assertReplayFrame(
  cdp: CdpClient,
  gameId: string,
  moveNumber: number,
  stoneCount: number,
  expectedTableState: string
): Promise<void> {
  await waitForValue(async () => {
    const replay = await evaluate<{
      allPointsDisabled: boolean;
      gameId: string | null;
      hasActions: boolean;
      hasControls: boolean;
      hasTask: boolean;
      moveNumber: number | null;
      state: string | null;
      stoneCount: number;
    }>(
      cdp,
      `(() => {
        const table = document.querySelector('[data-online-view="table"]');
        const points = Array.from(table?.querySelectorAll('.play-area button') ?? []);
        const slider = table?.querySelector('[data-table-replay-slider]');
        return {
          allPointsDisabled: points.length > 0 && points.every((point) => point.disabled),
          gameId: table?.getAttribute('data-table-replay') ?? null,
          hasActions: Boolean(table?.querySelector('.table-action-bar')),
          hasControls: Boolean(table?.querySelector('[data-table-replay-controls]')),
          hasTask: Boolean(table?.querySelector('.table-task-bar')),
          moveNumber: slider ? Number.parseInt(slider.value, 10) : null,
          state: table?.getAttribute('data-table-state') ?? null,
          stoneCount: table?.querySelectorAll('.play-area .stone').length ?? 0
        };
      })()`
    );

    return replay.gameId === gameId &&
      replay.moveNumber === moveNumber &&
      replay.stoneCount === stoneCount &&
      replay.state === expectedTableState &&
      replay.allPointsDisabled &&
      replay.hasControls &&
      !replay.hasActions &&
      !replay.hasTask
      ? replay
      : null;
  }, STEP_TIMEOUT_MS);
}

async function clickReplayControl(cdp: CdpClient, direction: "next" | "previous"): Promise<void> {
  const result = await evaluate<ClickResult>(
    cdp,
    `(() => {
      const button = document.querySelector('[data-table-replay-step="${direction}"]');
      if (!button || button.disabled) {
        return { ok: false, detail: document.querySelector('[data-table-replay-controls]')?.textContent ?? document.body.innerText };
      }
      button.click();
      return { ok: true, detail: button.getAttribute('aria-label') ?? '' };
    })()`
  );

  if (!result.ok) {
    throw new Error(`Could not step replay ${direction}: ${result.detail}`);
  }
}

async function clickReplayExit(cdp: CdpClient): Promise<void> {
  const result = await evaluate<ClickResult>(
    cdp,
    `(() => {
      const button = document.querySelector('[data-table-replay-exit]');
      if (!button) {
        return { ok: false, detail: document.body.innerText };
      }
      button.click();
      return { ok: true, detail: (button.textContent || '').trim() };
    })()`
  );

  if (!result.ok) {
    throw new Error(`Could not exit table replay: ${result.detail}`);
  }
}

async function assertPreviousGameReplay(cdp: CdpClient, gameId: string): Promise<void> {
  await clickSidebarTab(cdp, "history");
  await waitForValue(async () => {
    const previous = await evaluate<{
      gameId: string | null;
      hasProfileLink: boolean;
      replayButton: boolean;
    }>(
      cdp,
      `(() => ({
        gameId: document.querySelector('.table-previous-game strong')?.textContent ?? null,
        hasProfileLink: Boolean(document.querySelector('[data-table-record-profile][href*="/profile/"]')),
        replayButton: Boolean(document.querySelector('[data-table-replay-previous]'))
      }))()`
    );

    return previous.gameId === gameId && previous.hasProfileLink && previous.replayButton ? previous : null;
  }, STEP_TIMEOUT_MS);

  const clicked = await evaluate<boolean>(
    cdp,
    `(() => {
      const button = document.querySelector('[data-table-replay-previous]');
      button?.click();
      return Boolean(button);
    })()`
  );

  if (!clicked) {
    throw new Error(`Could not open previous game replay ${gameId}`);
  }

  await assertReplayFrame(cdp, gameId, 1, 1, "playing-my-turn");
  await clickReplayControl(cdp, "previous");
  await assertReplayFrame(cdp, gameId, 0, 0, "playing-my-turn");
  await clickReplayControl(cdp, "next");
  await assertReplayFrame(cdp, gameId, 1, 1, "playing-my-turn");
}

async function assertUndoLayoutAtTargetViewports(cdp: CdpClient): Promise<void> {
  const captureDir = process.env.GOMOKU_SMOKE_CAPTURE_DIR;
  const viewports = [
    { height: 900, width: 1440 },
    { height: 720, width: 1280 },
    { height: 844, width: 390 }
  ];

  try {
    for (const viewport of viewports) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 1,
        height: viewport.height,
        mobile: false,
        width: viewport.width
      });
      await evaluate<void>(cdp, `window.scrollTo(0, 0)`);
      const layout = await waitForValue(async () => {
        const current = await evaluate<{
          board: { bottom: number; top: number } | null;
          sidePanel: { bottom: number; top: number } | null;
          sidebarPlayersVisible: boolean;
          task: { bottom: number; top: number } | null;
          taskButtonsVisible: boolean;
          viewport: { height: number; width: number };
        }>(
          cdp,
          `(() => {
            const task = document.querySelector('.table-task-bar');
            const board = document.querySelector('.play-area .board-wrap');
            const sidePanel = document.querySelector('.table-side-panel');
            const taskRect = task?.getBoundingClientRect();
            const boardRect = board?.getBoundingClientRect();
            const sidePanelRect = sidePanel?.getBoundingClientRect();
            const taskButtons = Array.from(document.querySelectorAll('.table-task-actions button'));
            const playerCards = Array.from(document.querySelectorAll('.table-sidebar .room-player')).slice(0, 2);
            return {
              board: boardRect ? { bottom: boardRect.bottom, top: boardRect.top } : null,
              sidePanel: sidePanelRect ? { bottom: sidePanelRect.bottom, top: sidePanelRect.top } : null,
              sidebarPlayersVisible: playerCards.length === 2 && playerCards.every((card) => {
                const rect = card.getBoundingClientRect();
                return rect.top >= 0 && rect.bottom <= window.innerHeight;
              }),
              task: taskRect ? { bottom: taskRect.bottom, top: taskRect.top } : null,
              taskButtonsVisible: taskButtons.length === 2 && taskButtons.every((button) => {
                const rect = button.getBoundingClientRect();
                return rect.width >= 32 && rect.height >= 32 && rect.top >= 0 && rect.bottom <= window.innerHeight;
              }),
              viewport: { height: window.innerHeight, width: window.innerWidth }
            };
          })()`
        );

        return current.viewport.width === viewport.width && current.viewport.height === viewport.height ? current : null;
      }, STEP_TIMEOUT_MS);
      const isVisible =
        layout.task !== null &&
        layout.board !== null &&
        layout.sidePanel !== null &&
        layout.task.top >= 0 &&
        layout.task.bottom <= viewport.height &&
        layout.board.top >= layout.task.bottom &&
        layout.board.bottom <= viewport.height &&
        layout.taskButtonsVisible &&
        (viewport.width > 900
          ? layout.sidePanel.top >= 0 && layout.sidePanel.bottom <= viewport.height && layout.sidebarPlayersVisible
          : layout.sidePanel.top >= layout.board.bottom);

      if (!isVisible) {
        throw new Error(`Undo layout failed at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`);
      }

      if (captureDir) {
        await mkdir(captureDir, { recursive: true });
        const screenshot = (await cdp.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true
        })) as { data?: string };

        if (!screenshot.data) {
          throw new Error(`Chrome did not return a screenshot at ${viewport.width}x${viewport.height}`);
        }

        await writeFile(
          path.join(captureDir, `undo-${viewport.width}x${viewport.height}.png`),
          Buffer.from(screenshot.data, "base64")
        );
      }
    }
  } finally {
    await cdp.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function assertPlayableAtLowHeight(cdp: CdpClient): Promise<void> {
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 720,
      mobile: false,
      width: 1280
    });
    await evaluate<void>(cdp, `window.scrollTo(0, 0)`);
    const layout = await waitForValue(async () => {
      const current = await evaluate<{
        actionBottom: number | null;
        boardBottom: number | null;
        enabledPointVisible: boolean;
        scrollY: number;
        taskTop: number | null;
        viewport: { height: number; width: number };
      }>(
        cdp,
        `(() => {
          const actionBar = document.querySelector('.table-action-bar');
          const board = document.querySelector('.play-area .board-wrap');
          const point = document.querySelector('.board-point:not(:disabled)');
          const task = document.querySelector('.table-task-bar');
          const pointRect = point?.getBoundingClientRect();
          return {
            actionBottom: actionBar?.getBoundingClientRect().bottom ?? null,
            boardBottom: board?.getBoundingClientRect().bottom ?? null,
            enabledPointVisible: Boolean(pointRect && pointRect.top >= 0 && pointRect.bottom <= window.innerHeight),
            scrollY: window.scrollY,
            taskTop: task?.getBoundingClientRect().top ?? null,
            viewport: { height: window.innerHeight, width: window.innerWidth }
          };
        })()`
      );

      return current.viewport.width === 1280 && current.viewport.height === 720 ? current : null;
    }, STEP_TIMEOUT_MS);
    const isPlayable =
      layout.scrollY === 0 &&
      layout.taskTop !== null &&
      layout.taskTop >= 0 &&
      layout.boardBottom !== null &&
      layout.boardBottom <= 720 &&
      layout.actionBottom !== null &&
      layout.actionBottom <= 720 &&
      layout.enabledPointVisible;

    if (!isPlayable) {
      throw new Error(`Playable layout failed at 1280x720: ${JSON.stringify(layout)}`);
    }
  } finally {
    await cdp.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function navigateToLocaleTable(cdp: CdpClient, baseUrl: string, locale: string, roomCode: string): Promise<void> {
  const url = new URL(`/${locale}?room=${encodeURIComponent(roomCode)}`, `${baseUrl}/`).toString();

  await cdp.send("Page.navigate", { url });
  await waitForValue(async () => {
    const ready = await evaluate<boolean>(
      cdp,
      `document.readyState === 'complete' && window.location.pathname.endsWith(${JSON.stringify(`/${locale}`)})`
    );

    return ready ? true : null;
  }, START_TIMEOUT_MS);
}

async function assertRtlMobileTable(cdp: CdpClient): Promise<void> {
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 844,
      mobile: false,
      width: 390
    });
    await evaluate<void>(cdp, `window.scrollTo(0, 0)`);
    const layout = await waitForValue(async () => {
      const current = await evaluate<{
        boardTop: number | null;
        direction: string;
        noHorizontalOverflow: boolean;
        overflowing: string[];
        sidePanelTop: number | null;
        tabTargetsLargeEnough: boolean;
        taskTop: number | null;
        viewport: { height: number; width: number };
      }>(
        cdp,
        `(() => {
          const tabs = Array.from(document.querySelectorAll('.table-sidebar-tab-list button'));
          return {
            boardTop: document.querySelector('.play-area .board-wrap')?.getBoundingClientRect().top ?? null,
            direction: document.documentElement.dir,
            noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
            overflowing: Array.from(document.body.querySelectorAll('*'))
              .map((element) => ({ element, rect: element.getBoundingClientRect() }))
              .filter(({ rect }) => rect.left < -1 || rect.right > window.innerWidth + 1)
              .slice(0, 8)
              .map(({ element, rect }) => element.tagName.toLowerCase() + '.' + (element.className || '') + '[' + Math.round(rect.left) + ',' + Math.round(rect.right) + ']'),
            sidePanelTop: document.querySelector('.table-side-panel')?.getBoundingClientRect().top ?? null,
            tabTargetsLargeEnough: tabs.length === 3 && tabs.every((tab) => {
              const rect = tab.getBoundingClientRect();
              return rect.width >= 32 && rect.height >= 40;
            }),
            taskTop: document.querySelector('.table-task-bar')?.getBoundingClientRect().top ?? null,
            viewport: { height: window.innerHeight, width: window.innerWidth }
          };
        })()`
      );

      return current.viewport.width === 390 && current.viewport.height === 844 ? current : null;
    }, STEP_TIMEOUT_MS);
    const isValid =
      layout.direction === "rtl" &&
      layout.noHorizontalOverflow &&
      layout.taskTop !== null &&
      layout.boardTop !== null &&
      layout.sidePanelTop !== null &&
      layout.taskTop < layout.boardTop &&
      layout.boardTop < layout.sidePanelTop &&
      layout.tabTargetsLargeEnough;

    if (!isValid) {
      throw new Error(`RTL mobile table layout failed: ${JSON.stringify(layout)}`);
    }

    const captureDir = process.env.GOMOKU_SMOKE_CAPTURE_DIR;

    if (captureDir) {
      await mkdir(captureDir, { recursive: true });
      const screenshot = (await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true
      })) as { data?: string };

      if (screenshot.data) {
        await writeFile(path.join(captureDir, "table-rtl-390x844.png"), Buffer.from(screenshot.data, "base64"));
      }
    }
  } finally {
    await cdp.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function assertRtlMobileLobby(cdp: CdpClient): Promise<void> {
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 844,
      mobile: false,
      width: 390
    });
    await evaluate<void>(cdp, `window.scrollTo(0, 0)`);
    const layout = await waitForValue(async () => {
      const current = await evaluate<{
        criticalTargetsLargeEnough: boolean;
        direction: string;
        noHorizontalOverflow: boolean;
        order: Array<number | null>;
        viewport: { height: number; width: number };
      }>(
        cdp,
        `(() => {
          const selectors = [
            '.lobby-primary-action',
            '[data-lobby-section-toggle="friends"]',
            '.room-lobby',
            '.lobby-secondary-actions'
          ];
          const criticalTargets = Array.from(document.querySelectorAll('[data-lobby-action="quick-match"], [data-lobby-section-toggle="friends"]'));
          return {
            criticalTargetsLargeEnough: criticalTargets.length === 2 && criticalTargets.every((target) => {
              const rect = target.getBoundingClientRect();
              return rect.width >= 44 && rect.height >= 44;
            }),
            direction: document.documentElement.dir,
            noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
            order: selectors.map((selector) => document.querySelector(selector)?.getBoundingClientRect().top ?? null),
            viewport: { height: window.innerHeight, width: window.innerWidth }
          };
        })()`
      );

      return current.viewport.width === 390 && current.viewport.height === 844 ? current : null;
    }, STEP_TIMEOUT_MS);
    const numericOrder = layout.order.filter((value): value is number => value !== null);
    const ordered = numericOrder.length === 4 && numericOrder.every((value, index) => index === 0 || numericOrder[index - 1] < value);

    if (layout.direction !== "rtl" || !layout.noHorizontalOverflow || !layout.criticalTargetsLargeEnough || !ordered) {
      throw new Error(`RTL mobile lobby layout failed: ${JSON.stringify(layout)}`);
    }

    const captureDir = process.env.GOMOKU_SMOKE_CAPTURE_DIR;

    if (captureDir) {
      await mkdir(captureDir, { recursive: true });
      const screenshot = (await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true
      })) as { data?: string };

      if (screenshot.data) {
        await writeFile(path.join(captureDir, "lobby-rtl-390x844.png"), Buffer.from(screenshot.data, "base64"));
      }
    }
  } finally {
    await cdp.send("Emulation.clearDeviceMetricsOverride");
  }
}

class CdpClient {
  private commandId = 1;
  private readonly pending = new Map<number, PendingCommand>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;

      if (!message.id) {
        return;
      }

      const pending = this.pending.get(message.id);

      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message ?? "Chrome DevTools Protocol command failed"));
        return;
      }

      pending.resolve(message.result);
    });
  }

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out connecting to Chrome DevTools Protocol"));
      }, START_TIMEOUT_MS);

      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve(new CdpClient(socket));
      });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Failed to connect to Chrome DevTools Protocol"));
      });
    });
  }

  close(): void {
    this.socket.close();
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.commandId;
    this.commandId += 1;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function prepareRooms(baseUrl: string): Promise<PreparedRooms> {
  const suffix = Date.now().toString(36);
  const waitingHost = await connectClient(baseUrl);
  const playingHost = await connectClient(baseUrl);
  const playingGuest = await connectClient(baseUrl);

  const waitingRoom = requireOk(
    await emitAck(waitingHost, "room:create", {
      playerId: `ui-waiting-host-${suffix}`,
      playerName: `UI Waiting ${suffix}`
    }),
    "waiting room:create"
  ).snapshot;
  const playingRoom = requireOk(
    await emitAck(playingHost, "room:create", {
      playerId: `ui-playing-host-${suffix}`,
      playerName: `UI Playing ${suffix}`
    }),
    "playing room:create"
  ).snapshot;

  requireOk(
    await emitAck(playingGuest, "room:join", {
      playerId: `ui-playing-guest-${suffix}`,
      playerName: `UI Guest ${suffix}`,
      roomCode: playingRoom.code
    }),
    "playing room:join"
  );
  requireOk(await emitAck(playingHost, "room:ready", { ready: true, roomCode: playingRoom.code }), "host ready");
  requireOk(await emitAck(playingGuest, "room:ready", { ready: true, roomCode: playingRoom.code }), "guest ready");

  return {
    cleanup() {
      waitingHost.disconnect();
      playingHost.disconnect();
      playingGuest.disconnect();
    },
    playingCode: playingRoom.code,
    waitingCode: waitingRoom.code,
    waitingHost
  };
}

function connectClient(baseUrl: string): Promise<SmokeSocket> {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      forceNew: true,
      path: "/socket.io",
      reconnection: false,
      timeout: STEP_TIMEOUT_MS,
      transports: ["websocket"]
    }) as unknown as SmokeSocket;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("socket connect timed out")), STEP_TIMEOUT_MS);

    function finish(result: Error | SmokeSocket): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (result instanceof Error) {
        socket.disconnect();
        reject(result);
        return;
      }

      resolve(result);
    }

    socket.once("connect", () => finish(socket));
    socket.once("connect_error", (error: unknown) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function emitAck(socket: SmokeSocket, event: string, payload: unknown): Promise<RoomAck> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

async function evaluate<T>(cdp: CdpClient, expression: string): Promise<T> {
  const response = (await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true
  })) as RuntimeEvaluateResult;

  if (response.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
  }

  return response.result?.value as T;
}

async function clickButton(cdp: CdpClient, text: string): Promise<void> {
  const result = await waitForValue(
    async () =>
      evaluate<ClickResult>(
        cdp,
        `(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const button = buttons.find((candidate) => (candidate.textContent || "").includes(${JSON.stringify(text)}));
          if (!button) {
            return { ok: false, detail: buttons.map((candidate) => (candidate.textContent || "").trim()).join(" | ") };
          }
          button.click();
          return { ok: true, detail: (button.textContent || "").trim() };
        })()`
      ),
    STEP_TIMEOUT_MS
  );

  if (!result.ok) {
    throw new Error(`Could not find button "${text}". Buttons: ${result.detail}`);
  }
}

async function clickLobbySection(cdp: CdpClient, section: string): Promise<void> {
  const result = await evaluate<ClickResult>(
    cdp,
    `(() => {
      const button = document.querySelector('[data-lobby-section-toggle="${section}"]');
      if (!button) {
        return { ok: false, detail: document.body.innerText };
      }
      button.click();
      return { ok: true, detail: (button.textContent || '').trim() };
    })()`
  );

  if (!result.ok) {
    throw new Error(`Could not toggle lobby section ${section}: ${result.detail}`);
  }
}

async function clickTableAction(cdp: CdpClient, action: string): Promise<void> {
  const result = await evaluate<ClickResult>(
    cdp,
    `(() => {
      const button = document.querySelector('[data-table-action="${action}"]');
      if (!button) {
        return { ok: false, detail: document.body.innerText };
      }
      button.click();
      return { ok: true, detail: (button.textContent || '').trim() };
    })()`
  );

  if (!result.ok) {
    throw new Error(`Could not click table action ${action}: ${result.detail}`);
  }
}

async function setFriendRoomCode(cdp: CdpClient, roomCode: string): Promise<void> {
  const result = await evaluate<ClickResult>(
    cdp,
    `(() => {
      const input = document.querySelector('[data-lobby-section="friends"] input');
      if (!input) {
        return { ok: false, detail: document.body.innerText };
      }
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, ${JSON.stringify(roomCode)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true, detail: input.value };
    })()`
  );

  if (!result.ok || result.detail !== roomCode) {
    throw new Error(`Could not set friend room code: ${result.detail}`);
  }
}

async function clickLobbyRoomButton(cdp: CdpClient, roomCode: string): Promise<void> {
  const result = await waitForValue(
    async () =>
      evaluate<ClickResult>(
        cdp,
        `(() => {
          const rows = Array.from(document.querySelectorAll(".room-lobby-item"));
          const row = rows.find((candidate) => (candidate.textContent || "").includes(${JSON.stringify(roomCode)}));
          const button = row?.querySelector("button");
          if (!row || !button) {
            return { ok: false, detail: rows.map((candidate) => (candidate.textContent || "").trim()).join(" | ") };
          }
          button.click();
          return { ok: true, detail: (row.textContent || "").trim() };
        })()`
      ),
    STEP_TIMEOUT_MS
  );

  if (!result.ok) {
    throw new Error(`Could not click lobby room ${roomCode}. Rows: ${result.detail}`);
  }
}

async function assertLobbyRowContains(cdp: CdpClient, roomCode: string, text: string): Promise<void> {
  await waitForValue(async () => {
    const contains = await evaluate<boolean>(
      cdp,
      `Array.from(document.querySelectorAll(".room-lobby-item")).some((row) => {
        const content = row.textContent || "";
        return content.includes(${JSON.stringify(roomCode)}) && content.includes(${JSON.stringify(text)});
      })`
    );

    return contains ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function assertLobbyRoomGroup(cdp: CdpClient, roomCode: string, group: "joinable" | "watchable"): Promise<void> {
  await waitForValue(async () => {
    const contains = await evaluate<boolean>(
      cdp,
      `Array.from(document.querySelectorAll('[data-room-group="${group}"] .room-lobby-item')).some((row) =>
        (row.textContent || '').includes(${JSON.stringify(roomCode)})
      )`
    );

    return contains ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function waitForRuntime(cdp: CdpClient): Promise<void> {
  await waitForValue(
    async () => {
      const ready = await evaluate<boolean>(
        cdp,
        `document.readyState === "complete" && Array.from(document.querySelectorAll("button")).some((button) => (button.textContent || "").includes("Friend room"))`
      );

      return ready ? true : null;
    },
    START_TIMEOUT_MS
  );
}

async function waitForBodyText(cdp: CdpClient, text: string): Promise<void> {
  await waitForValue(async () => {
    const bodyText = await evaluate<string>(cdp, "document.body.innerText");

    return bodyText.includes(text) ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function waitForRoomUrl(cdp: CdpClient, roomCode: string): Promise<void> {
  await waitForValue(async () => {
    const href = await evaluate<string>(cdp, "window.location.href");

    return new URL(href).searchParams.get("room") === roomCode ? true : null;
  }, STEP_TIMEOUT_MS);
}

async function waitForNoRoomUrl(cdp: CdpClient): Promise<void> {
  await waitForValue(async () => {
    const href = await evaluate<string>(cdp, "window.location.href");

    return new URL(href).searchParams.has("room") ? null : true;
  }, STEP_TIMEOUT_MS);
}

async function waitForValue<T>(read: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();

    if (value !== null) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for condition");
}

function normalizeBaseUrl(input: string): string {
  const withProtocol = input.includes("://") ? input : `http://${input}`;
  const url = new URL(withProtocol);
  const path = /^\/(?:en|zh|fr|es|ru|ar)?\/?$/.test(url.pathname)
    ? ""
    : url.pathname.replace(/\/+$/, "");

  return `${url.origin}${path}`;
}

function findChromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates[0];
}

function launchChrome(chromePath: string, port: number, userDataDir: string, secureOrigin: string): ChildProcess {
  return spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--unsafely-treat-insecure-origin-as-secure=${secureOrigin}`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    {
      stdio: "ignore",
      windowsHide: true
    }
  );
}

function waitForProcessExit(childProcess: ChildProcess, timeoutMs = 5_000): Promise<void> {
  if (childProcess.exitCode !== null || childProcess.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);

    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitForChrome(port: number): Promise<void> {
  await waitForValue(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);

      return response.ok ? true : null;
    } catch {
      return null;
    }
  }, START_TIMEOUT_MS);
}

async function openBrowserTarget(port: number, url: string): Promise<string> {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, { method: "PUT" });

  if (!response.ok) {
    response = await fetch(endpoint);
  }

  if (!response.ok) {
    throw new Error(`Failed to open browser target: HTTP ${response.status}`);
  }

  const target = (await response.json()) as BrowserTarget;

  if (!target.webSocketDebuggerUrl) {
    throw new Error("Chrome target did not return a websocket debugger URL");
  }

  return target.webSocketDebuggerUrl;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a TCP port"));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function requireOk(ack: RoomAck, label: string) {
  if (!ack.ok) {
    throw new Error(`${label} failed: ${ack.error.code} ${ack.error.message}`);
  }

  return ack.value;
}

await main();
