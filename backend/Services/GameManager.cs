using System.Collections.Concurrent;
using StopGame.Api.Models;

namespace StopGame.Api.Services;

public class GameManager
{
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();

    public GameRoom CreateRoom(string roomCode)
    {
        var room = new GameRoom { RoomCode = roomCode };
        _rooms.TryAdd(roomCode, room);
        return room;
    }

    public GameRoom? GetRoom(string roomCode)
    {
        _rooms.TryGetValue(roomCode, out var room);
        return room;
    }

    public GameRoom? GetRoomByConnectionId(string connectionId)
    {
        return _rooms.Values.FirstOrDefault(r => r.Players.Any(p => p.ConnectionId == connectionId));
    }

    public bool JoinRoom(string roomCode, Player player)
    {
        var room = GetRoom(roomCode);
        if (room == null || room.GameStarted) return false;
        
        if (!room.Players.Any(p => p.ConnectionId == player.ConnectionId))
        {
            room.Players.Add(player);
        }
        return true;
    }

    public void LeaveRoom(string connectionId)
    {
        var room = GetRoomByConnectionId(connectionId);
        if (room != null)
        {
            room.Players.RemoveAll(p => p.ConnectionId == connectionId);
            if (room.Players.Count == 0)
            {
                _rooms.TryRemove(room.RoomCode, out _);
            }
        }
    }
}
