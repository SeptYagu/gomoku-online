export function getRoomUrlFromHref(href: string, roomCode: string): string {
  const url = new URL(href);

  url.searchParams.set("room", roomCode.trim().toUpperCase());

  return url.toString();
}

export function clearRoomUrlFromHref(href: string): string {
  const url = new URL(href);

  url.searchParams.delete("room");

  return url.toString();
}
