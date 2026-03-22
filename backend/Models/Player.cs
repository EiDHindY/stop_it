namespace StopGame.Api.Models;

public class Player
{
    public string ConnectionId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsEliminated { get; set; } = false;
}
