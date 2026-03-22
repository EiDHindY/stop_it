using System.Timers;
using Timer = System.Timers.Timer;

namespace StopGame.Api.Models;

public class GameRoom
{
    public string RoomCode { get; set; } = string.Empty;
    public List<Player> Players { get; set; } = new();
    public bool GameStarted { get; set; } = false;
    public int MaxPlayers { get; set; } = 10;
    public List<string> SelectedCategories { get; set; } = new();
    
    // Custom Mode State
    public string CurrentCategory { get; set; } = string.Empty;
    public string CurrentLetter { get; set; } = "A";
    public string Language { get; set; } = "en"; // "en" or "ar"
    public int CurrentTurnIndex { get; set; } = 0;
    public int TimeRemaining { get; set; } = 0;
    public int TurnTimerSeconds { get; set; } = 15;
    public Timer? TurnTimer { get; set; }
    
    public Player? GetActivePlayer()
    {
        if (Players.Count == 0 || !GameStarted) return null;
        return Players[CurrentTurnIndex];
    }
}
