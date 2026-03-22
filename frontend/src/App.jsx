import { useState, useEffect, useRef } from 'react'
import * as signalR from '@microsoft/signalr'
import { supabase } from './supabaseClient'
import './index.css'

function App() {
  const [connection, setConnection] = useState(null)
  const [joined, setJoined] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [gameState, setGameState] = useState(null)
  const [timer, setTimer] = useState(0)
  const [eliminatedMsg, setEliminatedMsg] = useState('')
  const [user, setUser] = useState(null)

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        setPlayerName(session.user.user_metadata.full_name || session.user.email)
      }
    })

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        setPlayerName(session.user.user_metadata.full_name || session.user.email)
      } else {
        setPlayerName('')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

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

  const setLanguage = (lang) => {
    if (connection && roomCode) {
      connection.invoke("SetLanguage", roomCode, lang)
    }
  }

  const submitAnswer = () => {
    connection.invoke("SubmitAnswer", roomCode, "") // For this mode, clicking is the answer
  }

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
    if (error) console.error('Error logging in:', error.message)
  }

  const logout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Error logging out:', error.message)
  }

  // 1. LOGIN VIEW
  if (!user) {
    return (
      <div className="login-page">
        <div className="card-glass login-card animate-fade-in">
          <div className="logo-container">
            <span className="logo-icon">🛑</span>
            <h1>Stop! Online</h1>
            <p className="subtitle">Real-time word battle with friends</p>
          </div>
          
          <button className="google-btn premium" onClick={loginWithGoogle}>
            <img src="https://www.google.com/favicon.ico" alt="Google" />
            Sign in with Google
          </button>
          
          <p className="footer-note">Experience the ultimate word competition</p>
        </div>
      </div>
    )
  }

  // 2. LOBBY VIEW
  if (!joined) {
    return (
      <div className="lobby-page">
        <div className="card-glass lobby-card animate-slide-up">
           <div className="user-profile-header">
              <img src={user.user_metadata.avatar_url} alt="Profile" className="avatar" />
              <div>
                <p className="welcome">Welcome back,</p>
                <h3>{user.user_metadata.full_name}</h3>
              </div>
              <button className="logout-icon-btn" onClick={logout} title="Sign Out">✕</button>
           </div>

           <div className="divider-h"></div>

           <div className="lobby-actions">
             <div className="input-group">
               <label>Enter Room Code</label>
               <input 
                 placeholder="e.g. 1337" 
                 value={roomCode} 
                 onChange={e => setRoomCode(e.target.value)} 
               />
             </div>
             
             <button className="join-btn-premium" onClick={joinRoom}>
               ENTER BATTLEARENA
             </button>
           </div>
        </div>
      </div>
    )
  }

  // 3. GAME VIEW (Wait for Game Start)
  if (!gameState?.gameStarted) {
    return (
      <div className="waiting-page">
        <div className="card-glass waiting-card animate-pulse-gentle">
          <div className="room-info-header">
            <h2>Room: <span className="highlight">{roomCode}</span></h2>
            <div className="badge">Waiting for Players</div>
          </div>
          
          <div className="players-grid">
            {gameState?.players.map(p => (
              <div key={p.name} className="player-bubble">
                {p.name}
              </div>
            ))}
          </div>

          <div className="language-selection">
            <span className="label">Linguistic Battleground</span>
            <div className="toggle-group">
              <button 
                className={`toggle-btn ${gameState?.language === 'en' ? 'active' : ''}`}
                onClick={() => setLanguage('en')}
              >
                ENGLISH
              </button>
              <button 
                className={`toggle-btn ${gameState?.language === 'ar' ? 'active' : ''}`}
                onClick={() => setLanguage('ar')}
              >
                ARABIC
              </button>
            </div>
          </div>

          <div className="waiting-footer">
            <p>{gameState?.players.length < 2 ? "Need at least 2 warriors for a clash" : "Armies are ready!"}</p>
            <button 
              className="start-btn-premium"
              onClick={startGame} 
              disabled={gameState?.players.length < 2}
            >
              IGNITE BATTLE
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 4. ACTIVE GAME VIEW
  const isActive = gameState.activePlayer === playerName

  return (
    <div className="game-page animate-fade-in">
       <div className="game-container">
          <div className="sidebar card-glass">
            <h3>Warriors</h3>
            <div className="players-list-modern">
              {gameState.players.map(p => (
                <div key={p.name} className={`player-row ${p.name === gameState.activePlayer ? 'active' : ''} ${p.isEliminated ? 'eliminated' : ''}`}>
                  <span className="status-indicator"></span>
                  <span className="p-name">{p.name}</span>
                  {p.isEliminated && <span className="skull">💀</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="main-board">
            <div className="category-banner card-glass">
               {gameState.currentCategory}
            </div>
            
            <div className={`letter-display ${gameState.language === 'ar' ? 'arabic-mode' : ''}`}>
               <h1 className="giant-letter">{gameState.currentLetter}</h1>
            </div>

            <div className="game-footer">
               <div className={`timer-modern ${timer < 5 ? 'critical' : ''}`}>
                  <svg className="timer-svg" viewBox="0 0 36 36">
                    <path className="timer-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="timer-progress" strokeDasharray={`${(timer / 15) * 100}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <span className="timer-text">{timer}</span>
               </div>

               {eliminatedMsg && <div className="broadcast-msg animate-bounce-in">{eliminatedMsg}</div>}

               <div className="game-actions">
                  {isActive ? (
                    <button className="action-btn-main pulse" onClick={submitAnswer}>
                      I GOT IT! NEXT
                    </button>
                  ) : (
                    <div className="waiting-msg">
                       Waiting for <strong>{gameState.activePlayer}</strong>...
                    </div>
                  )}
               </div>
            </div>
          </div>
       </div>
    </div>
  )
}

export default App
