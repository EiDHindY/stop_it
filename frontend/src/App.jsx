import { useState, useEffect, useRef } from 'react'
import * as signalR from '@microsoft/signalr'
import './index.css'

function App() {
  const [connection, setConnection] = useState(null)
  const [joined, setJoined] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [gameState, setGameState] = useState(null)
  const [timer, setTimer] = useState(0)
  const [eliminatedMsg, setEliminatedMsg] = useState('')

  useEffect(() => {
    const newConnection = new signalR.HubConnectionBuilder()
      .withUrl("http://localhost:5122/gamehub") // Match your .NET port
      .withAutomaticReconnect()
      .build()

    setConnection(newConnection)
  }, [])

  useEffect(() => {
    if (connection) {
      connection.start()
        .then(() => {
          console.log('Connected to SignalR Hub')
          connection.on("RoomStateUpdated", (state) => {
            setGameState(state)
            setTimer(state.timeRemaining)
          })
          connection.on("TimerUpdate", (t) => setTimer(t))
          connection.on("PlayerEliminated", (name) => {
            setEliminatedMsg(`${name} was too slow!`)
            setTimeout(() => setEliminatedMsg(''), 3000)
          })
          connection.on("GameOver", (winner) => {
            alert(winner ? `Game Over! ${winner} Wins!` : "Game Over! No one won.")
            window.location.reload()
          })
        })
        .catch(e => console.log('Connection failed: ', e))
    }
  }, [connection])

  const joinRoom = () => {
    if (connection && roomCode && playerName) {
      connection.invoke("JoinRoom", roomCode, playerName)
        .then(() => setJoined(true))
    }
  }

  const startGame = () => {
    connection.invoke("StartGame", roomCode)
  }

  const submitAnswer = () => {
    connection.invoke("SubmitAnswer", roomCode, "") // For this mode, clicking is the answer
  }

  if (!joined) {
    return (
      <div className="card-glass lobby-container">
        <h1>Stop! Online</h1>
        <input 
          placeholder="Your Name" 
          value={playerName} 
          onChange={e => setPlayerName(e.target.value)} 
        />
        <input 
          placeholder="Room Code" 
          value={roomCode} 
          onChange={e => setRoomCode(e.target.value)} 
        />
        <button onClick={joinRoom}>Join Game Room</button>
      </div>
    )
  }

  if (!gameState?.gameStarted) {
    return (
      <div className="card-glass">
        <h2>Room: {roomCode}</h2>
        <div className="players-list">
          <h3>Players Joined:</h3>
          {gameState?.players.map(p => (
            <div key={p.name} className="player-item">{p.name}</div>
          ))}
        </div>
        <p>Wait for 2+ players to start</p>
        <button 
          onClick={startGame} 
          disabled={gameState?.players.length < 2}
        >
          Start Game
        </button>
      </div>
    )
  }

  const isActive = gameState.activePlayer === playerName

  return (
    <div className="card-glass game-board">
      <div className="players-list">
        <h3>Players</h3>
        {gameState.players.map(p => (
          <div key={p.name} className={`player-item ${p.name === gameState.activePlayer ? 'active' : ''} ${p.isEliminated ? 'eliminated' : ''}`}>
             <span>{p.name}</span>
             {p.isEliminated && <span>💀</span>}
          </div>
        ))}
      </div>

      <div className="current-state">
        <span className="category-name">{gameState.currentCategory}</span>
        <h1 className="large-letter">{gameState.currentLetter}</h1>
        <div className={`timer-ring ${timer < 5 ? 'low' : ''}`}>
          {timer}s
        </div>
        {eliminatedMsg && <div className="eliminated-broadcast">{eliminatedMsg}</div>}
      </div>

      <div className="actions">
        <h3>Your Turn?</h3>
        {isActive ? (
          <button className="submit-btn" onClick={submitAnswer}>I GOT IT! (NEXT)</button>
        ) : (
          <p>Waiting for {gameState.activePlayer}...</p>
        )}
      </div>
    </div>
  )
}

export default App
