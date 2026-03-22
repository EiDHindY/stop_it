using Microsoft.AspNetCore.SignalR;
using StopGame.Api.Models;
using StopGame.Api.Services;

namespace StopGame.Api.Hubs;

public class GameHub : Hub
{
    private readonly GameManager _gameManager;

    public GameHub(GameManager gameManager)
    {
        _gameManager = gameManager;
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var room = _gameManager.GetRoomByConnectionId(Context.ConnectionId);
        if (room != null)
        {
            _gameManager.LeaveRoom(Context.ConnectionId);
            await Clients.Group(room.RoomCode).SendAsync("PlayerLeft", Context.ConnectionId);
            await NotifyRoomState(room);
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinRoom(string roomCode, string playerName)
    {
        var room = _gameManager.GetRoom(roomCode) ?? _gameManager.CreateRoom(roomCode);
        
        var player = new Player { ConnectionId = Context.ConnectionId, Name = playerName };
        if (_gameManager.JoinRoom(roomCode, player))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
            await NotifyRoomState(room);
        }
    }

    public async Task StartGame(string roomCode)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room != null && !room.GameStarted && room.Players.Count > 1)
        {
            room.GameStarted = true;
            room.CurrentTurnIndex = 0;
            room.CurrentCategory = "Songs"; // Example default
            room.CurrentLetter = 'A';
            
            await NextTurn(room);
        }
    }

    public async Task SubmitAnswer(string roomCode, string answer)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room == null || !room.GameStarted) return;

        var activePlayer = room.GetActivePlayer();
        if (activePlayer?.ConnectionId != Context.ConnectionId) return;

        // In a real game, you would validate the answer here
        
        // Stop current timer
        room.TurnTimer?.Stop();
        
        // Move to next player
        room.CurrentTurnIndex = (room.CurrentTurnIndex + 1) % room.Players.Count;
        
        // Skip eliminated players
        while (room.GetActivePlayer()?.IsEliminated == true)
        {
             room.CurrentTurnIndex = (room.CurrentTurnIndex + 1) % room.Players.Count;
        }

        // Change letter/category randomly for the next turn
        var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        room.CurrentLetter = letters[new Random().Next(letters.Length)];
        
        await NextTurn(room);
    }

    private async Task NextTurn(GameRoom room)
    {
        var activePlayer = room.GetActivePlayer();
        if (activePlayer == null || room.Players.Count(p => !p.IsEliminated) <= 1)
        {
            await Clients.Group(room.RoomCode).SendAsync("GameOver");
            return;
        }

        room.TimeRemaining = 15; // 15 seconds per turn
        await NotifyRoomState(room);

        room.TurnTimer?.Dispose();
        room.TurnTimer = new System.Timers.Timer(1000);
        room.TurnTimer.Elapsed += async (sender, e) => await TimerTick(room);
        room.TurnTimer.Start();
    }

    private async Task TimerTick(GameRoom room)
    {
        room.TimeRemaining--;
        if (room.TimeRemaining <= 0)
        {
            room.TurnTimer?.Stop();
            var activePlayer = room.GetActivePlayer();
            if (activePlayer != null)
            {
                activePlayer.IsEliminated = true;
                await Clients.Group(room.RoomCode).SendAsync("PlayerEliminated", activePlayer.Name);
                
                // Check win condition
                if (room.Players.Count(p => !p.IsEliminated) <= 1)
                {
                    var winner = room.Players.FirstOrDefault(p => !p.IsEliminated);
                    await Clients.Group(room.RoomCode).SendAsync("GameOver", winner?.Name);
                    return;
                }
                
                // Move to next turn
                room.CurrentTurnIndex = (room.CurrentTurnIndex + 1) % room.Players.Count;
                while (room.GetActivePlayer()?.IsEliminated == true)
                {
                     room.CurrentTurnIndex = (room.CurrentTurnIndex + 1) % room.Players.Count;
                }
                await NextTurn(room);
            }
        }
        else
        {
            await Clients.Group(room.RoomCode).SendAsync("TimerUpdate", room.TimeRemaining);
        }
    }

    private async Task NotifyRoomState(GameRoom room)
    {
        await Clients.Group(room.RoomCode).SendAsync("RoomStateUpdated", new
        {
            room.RoomCode,
            room.GameStarted,
            room.CurrentCategory,
            room.CurrentLetter,
            room.TimeRemaining,
            ActivePlayer = room.GetActivePlayer()?.Name,
            Players = room.Players.Select(p => new { p.Name, p.IsEliminated })
        });
    }
}
