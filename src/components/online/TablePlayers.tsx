import type { GameDictionary } from "@/i18n/dictionaries";
import type { RoomClientState } from "@/server/room-contract";
import { Users } from "lucide-react";

type TablePlayersProps = {
  dictionary: GameDictionary;
  room: RoomClientState;
};

export function TablePlayers({ dictionary, room }: TablePlayersProps) {
  const labels = dictionary.room;
  const snapshot = room.snapshot;

  return (
    <div className="table-players">
      <div className="room-players">
        {snapshot.players.map((player) => (
          <div className="room-player" key={player.seat}>
            <span
              aria-label={player.seat === "black" ? dictionary.status.blackStone : dictionary.status.whiteStone}
              className={`stone-preview ${player.seat}`}
              role="img"
            />
            <div>
              <strong>
                {player.name}
                {player.seat === room.seat ? ` ${labels.you}` : ""}
              </strong>
              <p>
                {player.ready ? labels.ready : labels.notReady}
                {" · "}
                {player.connected ? labels.connected : labels.disconnected}
              </p>
            </div>
          </div>
        ))}
      </div>

      {snapshot.spectators.length > 0 ? (
        <div className="room-spectators">
          <p className="metric-label">{labels.spectators}</p>
          <div className="room-players">
            {snapshot.spectators.map((spectator) => (
              <div className="room-player" key={`${spectator.name}-${spectator.joinedAt}`}>
                <Users aria-hidden="true" className="room-spectator-icon" focusable={false} />
                <div>
                  <strong>
                    {spectator.name}
                    {room.role === "spectator" && spectator.name === room.name ? ` ${labels.you}` : ""}
                  </strong>
                  <p>{spectator.connected ? labels.connected : labels.disconnected}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
