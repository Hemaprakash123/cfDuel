import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Container, Row, Col, Card, ListGroup, Button, Spinner, Alert, Badge,
  Form, InputGroup, Toast, ToastContainer
} from "react-bootstrap";
import { io } from "socket.io-client";

// Configuration constants
const API_BASE = "http://localhost:5000";
const SOCKET_URL = API_BASE;
const LOCAL_ROOM_KEY = "blitzcup_roomId";

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  // State management
  const [room, setRoom] = useState(null);
  const [user, setUser] = useState(null);
  const [currentProblem, setCurrentProblem] = useState(null);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isContestFinished, setIsContestFinished] = useState(false);
  // State for the countdown timer
  const [timeLeft, setTimeLeft] = useState(null);

  // Refs
  const socketRef = useRef(null);
  const mountedRef = useRef(true);
  const chatScrollRef = useRef(null);

  // --- Helper Functions ---
  function pushNotification(msg) {
    if (!msg) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const toast = { id, msg, show: true };
    setNotifications(prev => [toast, ...prev]);
    setTimeout(() => setNotifications(prev => prev.map(t => t.id === id ? { ...t, show: false } : t)), 6000);
    setTimeout(() => setNotifications(prev => prev.filter(t => t.id !== id)), 7000);
  }

  // Formats seconds into a user-friendly MM:SS format.
  const formatTime = (seconds) => {
      if (seconds === null || seconds < 0) return "00:00";
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // --- Core Component Logic (useEffect) ---
  useEffect(() => {
    mountedRef.current = true;
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    const headers = { "x-auth-token": token };

    async function init() {
      setLoading(true);
      try {
        const socket = io(SOCKET_URL, { transports: ['websocket'], auth: { token } });
        socketRef.current = socket;

        // --- Socket Event Listeners ---
        socket.on('connect', () => {
          socket.emit('new-user', { roomId });
        });

        socket.on('initial-state', payload => {
          if (!mountedRef.current) return;
          if (payload?.scores) setScores(payload.scores);
          if (payload?.currentProblem) {
            setCurrentProblem(payload.currentProblem);
            setIsContestFinished(false);
          }
        });

        socket.on('contest-finished', payload => {
          if (!mountedRef.current) return;
          if (payload?.scores) setScores(payload.scores);
          setCurrentProblem(null);
          setIsContestFinished(true);
          setTimeLeft(0);
          pushNotification('The contest has ended.');
        });
        
        socket.on('notification', msg => pushNotification(msg));
        socket.on('new-problem', (prob) => { 
            setCurrentProblem(prob); 
            setIsContestFinished(false);
            pushNotification(`New problem: ${prob?.name || 'Problem'}`); 
        });
        socket.on('score-update', s => setScores(s || {}));
        socket.on('problem-solved', p => pushNotification(`${p?.username} solved ${p?.problem?.name}`));
        socket.on('chat-message', m => setChatMessages(prev => [...prev, m]));

        // Listener for the timer countdown
        socket.on('countdown', ({ remaining }) => {
            if (mountedRef.current) setTimeLeft(remaining);
        });

        // Listener for when time runs out
        socket.on('time-up', () => {
            if (mountedRef.current) {
                setTimeLeft(0);
                pushNotification("Time's up!");
            }
        });

        const [profileRes, roomRes] = await Promise.all([
          axios.get(`${API_BASE}/api/profile/me`, { headers }),
          axios.get(`${API_BASE}/api/rooms/details/${encodeURIComponent(roomId)}`, { headers })
        ]);

        if (!mountedRef.current) return;

        setUser(profileRes.data);
        setRoom(roomRes.data);
        
        if (roomRes.data && !roomRes.data.contestIsActive) {
            setIsContestFinished(true);
        }

      } catch (err) {
        console.error('RoomPage init error', err);
        setError('Could not fetch room details. The room may not exist or the server is down.');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    init();

    return () => {
      mountedRef.current = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [roomId, navigate]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // --- Action Handlers ---
  const handleVerify = async () => {
    if (isContestFinished || (timeLeft !== null && timeLeft <= 0)) {
      pushNotification("Cannot verify, the time is up or the contest is over.");
      return;
    }
    setVerifying(true);
    const token = localStorage.getItem('token');
    try {
      const res = await axios.post(`${API_BASE}/api/rooms/verify`, { roomId }, { headers: { 'x-auth-token': token } });
      pushNotification(res.data?.msg || 'Verification requested');
    } catch (err) {
      console.error('verify err', err);
      pushNotification(err?.response?.data?.msg || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || !user) return;
    const payload = { roomId, username: user.username, text: chatMessage.trim() };
    if (socketRef.current) {
      socketRef.current.emit('chat-message', payload);
    }
    setChatMessage('');
  };

  const handleQuitRoom = async () => {
    const token = localStorage.getItem('token');
    try {
      await axios.post(`${API_BASE}/api/rooms/leave`, { roomId }, { headers: { 'x-auth-token': token } });
    } catch (err) {
      console.warn('Server leave request failed', err?.response?.data || err.message);
      pushNotification('Could not notify server of exit. Cleaning up locally.');
    } finally {
      localStorage.removeItem(LOCAL_ROOM_KEY);
      if (socketRef.current) {
        socketRef.current.emit('leave-room', { roomId });
        socketRef.current.disconnect();
      }
      navigate('/home');
    }
  };

  // --- Render Logic ---
  if (loading) return <div className="text-center mt-5"><Spinner animation="border" /></div>;
  if (error) return <Container className="text-center mt-5"><Alert variant="danger">{error}</Alert></Container>;

  return (
    <Container fluid className="p-3">
      <ToastContainer position="top-end" className="p-3">
        {notifications.map(t => (
          <Toast key={t.id} onClose={() => setNotifications(prev => prev.filter(x => x.id !== t.id))} show={t.show} delay={5000} autohide>
            <Toast.Header><strong className="me-auto">Notification</strong></Toast.Header>
            <Toast.Body>{t.msg}</Toast.Body>
          </Toast>
        ))}
      </ToastContainer>

      <Row>
        <Col md={8}>
          <Card>
            <Card.Header as="h4" className="d-flex justify-content-between align-items-center">
              <span>Contest Room</span>
              {/* --- TIMER DISPLAY --- */}
              {timeLeft !== null && !isContestFinished && (
                  <Badge bg={timeLeft <= 60 ? "danger" : "info"} style={{fontSize: '1rem'}}>
                      Time Left: {formatTime(timeLeft)}
                  </Badge>
              )}
            </Card.Header>
            <Card.Body>
              {isContestFinished ? (
                <>
                  <Card.Title>Contest Finished!</Card.Title>
                  <p>Thanks for playing. Check out the final scores on the right.</p>
                </>
              ) : currentProblem ? (
                <>
                  <Card.Title className="d-flex justify-content-between align-items-center">
                    <span>{currentProblem.name}</span>
                    <Badge bg="secondary">{currentProblem.points}</Badge>
                  </Card.Title>
                  <div className="mb-3">{(currentProblem.tags || []).map(tag => <Badge pill bg="info" key={tag} className="me-1">{tag}</Badge>)}</div>
                  <p>Solve the problem on Codeforces and click the Verify button.</p>
                  <div className="d-grid gap-2 d-md-flex">
                    <Button variant="primary" href={currentProblem.url} target="_blank" rel="noreferrer">View on Codeforces</Button>
                    <Button 
                        variant="success" 
                        onClick={handleVerify} 
                        disabled={verifying || (timeLeft !== null && timeLeft <= 0)}
                    >
                        {verifying ? 'Verifying...' : 'Verify Solution'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Card.Title>Waiting for contest to start...</Card.Title>
                  <p>The contest will begin shortly after another participant joins.</p>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="mb-3">
            <Card.Header as="h5">Scoreboard</Card.Header>
            <ListGroup variant="flush">
              {Object.keys(scores).length > 0 ? (
                Object.entries(scores).sort((a,b) => b[1] - a[1]).map(([username, score]) => (
                  <ListGroup.Item key={username} className="d-flex justify-content-between align-items-center">
                    <div><strong>{username}</strong></div>
                    <Badge bg="primary" pill>{score}</Badge>
                  </ListGroup.Item>
                ))
              ) : (
                <ListGroup.Item>Waiting for scores...</ListGroup.Item>
              )}
            </ListGroup>
          </Card>
          <Card className="mb-3">
            <Card.Header as="h5">Live Chat</Card.Header>
            <Card.Body style={{ height: '250px', overflowY: 'auto' }} ref={chatScrollRef}>
              {chatMessages.map((m,i) => <p key={i}><strong>{m.username}:</strong> {m.text}</p>)}
            </Card.Body>
            <Card.Footer>
              <Form onSubmit={handleSendMessage}>
                <InputGroup>
                  <Form.Control placeholder="Type a message..." value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} />
                  <Button variant="outline-secondary" type="submit">Send</Button>
                </InputGroup>
              </Form>
            </Card.Footer>
          </Card>
          <div className="d-grid">
            <Button variant="danger" onClick={handleQuitRoom}>Quit Room</Button>
          </div>
        </Col>
      </Row>
    </Container>
  );
}
