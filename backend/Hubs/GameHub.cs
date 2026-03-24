using Microsoft.AspNetCore.SignalR;
using StopGame.Api.Models;
using StopGame.Api.Services;

namespace StopGame.Api.Hubs;

public class GameHub : Hub
{
    private readonly GameManager _gameManager;
    private readonly IHubContext<GameHub> _hubContext;

    public GameHub(GameManager gameManager, IHubContext<GameHub> hubContext)
    {
        _gameManager = gameManager;
        _hubContext = hubContext;
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

    public async Task<bool> JoinRoom(string roomCode, string playerName)
    {
        var room = _gameManager.GetRoom(roomCode) ?? _gameManager.CreateRoom(roomCode);
        
        var player = new Player { ConnectionId = Context.ConnectionId, Name = playerName };
        if (_gameManager.JoinRoom(roomCode, player))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
            await NotifyRoomState(room);
            return true;
        }
        return false;
    }

    public async Task SetLanguage(string roomCode, string language)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room != null && !room.GameStarted)
        {
            room.Language = language;
            await NotifyRoomState(room);
        }
    }

    public async Task SetMaxPlayers(string roomCode, int maxPlayers)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room != null && !room.GameStarted)
        {
            room.MaxPlayers = maxPlayers;
            await NotifyRoomState(room);
        }
    }

    public async Task SetCategories(string roomCode, string[] categories)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room != null && !room.GameStarted)
        {
            room.SelectedCategories = categories.ToList();
            await NotifyRoomState(room);
        }
    }

    public async Task SetTurnTimer(string roomCode, int seconds)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room != null && !room.GameStarted)
        {
            room.TurnTimerSeconds = seconds;
            await NotifyRoomState(room);
        }
    }

    public async Task ResetScores(string roomCode)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room != null)
        {
            foreach (var player in room.Players)
            {
                player.Scores = 0;
            }
            await NotifyRoomState(room);
        }
    }

    public async Task StartGame(string roomCode)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room != null && !room.GameStarted && room.Players.Count >= 1)
        {
            room.GameStarted = true;
            room.CurrentTurnIndex = 0;
            
            // Pick first category
            if (room.SelectedCategories.Any())
            {
                room.CurrentCategory = room.SelectedCategories[new Random().Next(room.SelectedCategories.Count)];
            }
            else
            {
                room.CurrentCategory = room.Language == "ar" ? "جماد" : "General";
            }

            room.CurrentLetter = GetRandomLetter(room.Language);
            
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
        room.CurrentLetter = GetRandomLetter(room.Language);
        if (room.SelectedCategories.Any())
        {
            room.CurrentCategory = room.SelectedCategories[new Random().Next(room.SelectedCategories.Count)];
        }
        
        await NextTurn(room);
    }

    private async Task NextTurn(GameRoom room)
    {
        var activePlayer = room.GetActivePlayer();
        // Only end game if there were 2+ players and now 1 left, or everyone is gone
        bool isMultiplayer = room.Players.Count > 1;
        bool onlyOneLeft = room.Players.Count(p => !p.IsEliminated) <= 1;

        if (activePlayer == null || (isMultiplayer && onlyOneLeft))
        {
            var winner = room.Players.FirstOrDefault(p => !p.IsEliminated);
            if (winner != null) winner.Scores++; // Record the win!
            
            await _hubContext.Clients.Group(room.RoomCode).SendAsync("GameOver", winner?.Name);
            return;
        }

        room.TimeRemaining = room.TurnTimerSeconds;
        await NotifyRoomState(room);

        room.TurnTimer?.Dispose();
        room.TurnTimer = new System.Timers.Timer(1000);
        room.TurnTimer.Elapsed += async (sender, e) => 
        {
            try 
            {
                await TimerTick(room);
            }
            catch (Exception ex)
            {
                // In a real app, log this
                Console.WriteLine($"Timer error: {ex.Message}");
            }
        };
        room.TurnTimer.Start();
    }

    private async Task TimerTick(GameRoom room)
    {
        room.TimeRemaining--;
        await _hubContext.Clients.Group(room.RoomCode).SendAsync("TimerUpdate", room.TimeRemaining);

        if (room.TimeRemaining <= 0)
        {
            room.TurnTimer?.Stop();
            var activePlayer = room.GetActivePlayer();
            if (activePlayer != null)
            {
                activePlayer.IsEliminated = true;
                await _hubContext.Clients.Group(room.RoomCode).SendAsync("PlayerEliminated", activePlayer.Name);
                
                // Check win condition
                if (room.Players.Count(p => !p.IsEliminated) <= 1)
                {
                    var winner = room.Players.FirstOrDefault(p => !p.IsEliminated);
                    await _hubContext.Clients.Group(room.RoomCode).SendAsync("GameOver", winner?.Name);
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
    }

    private string GetRandomLetter(string lang)
    {
        var english = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var arabic = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي";
        
        string picked;
        if (lang == "mixed")
        {
            picked = new Random().Next(2) == 0 ? english : arabic;
        }
        else
        {
            picked = lang == "ar" ? arabic : english;
        }
        
        return picked[new Random().Next(picked.Length)].ToString();
    }

    private async Task NotifyRoomState(GameRoom room)
    {
        await _hubContext.Clients.Group(room.RoomCode).SendAsync("RoomStateUpdated", new
        {
            room.RoomCode,
            room.GameStarted,
            room.CurrentCategory,
            room.CurrentLetter,
            room.Language,
            room.MaxPlayers,
            room.TurnTimerSeconds,
            SelectedCategoriesCount = room.SelectedCategories.Count,
            room.TimeRemaining,
            ActivePlayer = room.GetActivePlayer()?.Name,
            Players = room.Players.Select(p => new { p.Name, p.IsEliminated, p.Scores })
        });
    }
}
