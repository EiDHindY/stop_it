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
  const [lobbyView, setLobbyView] = useState('selection') // 'selection', 'host', 'join'
  const [selectedLang, setSelectedLang] = useState('en')

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

  const hostGame = () => {
    const newRoomCode = Math.floor(1000 + Math.random() * 9000).toString()
    setRoomCode(newRoomCode)
    if (connection && playerName) {
      connection.invoke("JoinRoom", newRoomCode, playerName)
        .then(() => {
          setJoined(true)
          // Set the language immediately after joining as host
          connection.invoke("SetLanguage", newRoomCode, selectedLang)
        })
    }
  }

  const joinRoom = (code = roomCode) => {
    if (connection && code && playerName) {
      connection.invoke("JoinRoom", code, playerName)
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
          
          <p className="footer-note">Experience the ultimate word game</p>
        </div>
      </div>
    )
  }

  // 2. LOBBY VIEW (Selection)
  if (!joined) {
    if (lobbyView === 'selection') {
      return (
        <div className="lobby-page selection">
          <div className="card-glass selection-card animate-slide-up">
             <div className="user-profile-header">
                <img src={user.user_metadata.avatar_url} alt="Profile" className="avatar" />
                <div>
                  <p className="welcome">Welcome back,</p>
                  <h3>{user.user_metadata.full_name}</h3>
                </div>
                <button className="logout-icon-btn" onClick={logout} title="Sign Out">✕</button>
             </div>
             <div className="divider-h"></div>
             
             <div className="lobby-choices">
               <button className="choice-card host" onClick={() => setLobbyView('host')}>
                 <span className="icon">🛡️</span>
                 <div className="text-content">
                    <h3>Host a Game</h3>
                    <p>Invite your friends to your arena</p>
                 </div>
               </button>
               
               <div className="choice-card join-direct">
                 <span className="icon">⚔️</span>
                 <div className="text-content">
                    <h3>Join a Game</h3>
                    <textarea 
                      className="paste-area-mini"
                      placeholder="Paste code here to join..." 
                      value={roomCode} 
                      onChange={e => {
                        const val = e.target.value.trim().slice(0, 4)
                        setRoomCode(val)
                        if (val.length === 4) {
                          joinRoom(val)
                        }
                      }} 
                    />
                 </div>
               </div>
             </div>
          </div>
        </div>
      )
    }

    if (lobbyView === 'host') {
      return (
        <div className="lobby-page host-view">
          <div className="card-glass lobby-card animate-slide-up">
             <button className="back-btn" onClick={() => setLobbyView('selection')}>← Back</button>
             <h2>Host a Game</h2>
             <p className="description">Set your rules before the warriors arrive.</p>
             <div className="divider-h"></div>
             
             <div className="lobby-actions">
               <div className="language-selection">
                <span className="label">Game Language</span>
                <div className="toggle-group">
                  <button 
                    className={`toggle-btn ${selectedLang === 'en' ? 'active' : ''}`}
                    onClick={() => setSelectedLang('en')}
                  >
                    ENGLISH
                  </button>
                  <button 
                    className={`toggle-btn ${selectedLang === 'ar' ? 'active' : ''}`}
                    onClick={() => setSelectedLang('ar')}
                  >
                    ARABIC
                  </button>
                </div>
              </div>

               <button className="join-btn-premium" onClick={hostGame}>
                 GENERATE & START GAME
               </button>
             </div>
          </div>
        </div>
      )
    }

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

          {/* Language display removed from here as it's now a host setting */}

          <div className="waiting-footer">
            <p>{gameState?.players.length < 2 ? "Need at least 2 warriors for a clash" : "Armies are ready!"}</p>
            <button 
              className="start-btn-premium"
              onClick={startGame} 
              disabled={gameState?.players.length < 2}
            >
              {gameState?.players.length < 2 ? "WAITING FOR WARRIORS" : "START GAME"}
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
