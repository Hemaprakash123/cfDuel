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

  // State management for all component data
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

  // Refs for managing socket connection and DOM elements
  const socketRef = useRef(null);
  const mountedRef = useRef(true);
  const chatScrollRef = useRef(null);

  // --- Helper Functions ---

  // Displays a toast notification on the screen.
  function pushNotification(msg) {
    if (!msg) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const toast = { id, msg, show: true };
    setNotifications(prev => [toast, ...prev]);
    setTimeout(() => setNotifications(prev => prev.map(t => t.id === id ? { ...t, show: false } : t)), 6000);
    setTimeout(() => setNotifications(prev => prev.filter(t => t.id !== id)), 7000);
  }

  // --- Core Component Logic (useEffect) ---

  useEffect(() => {
    mountedRef.current = true;
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    const headers = { "x-auth-token": token };

    // Initialization function to connect and fetch data.
    async function init() {
      setLoading(true);
      try {
        // 1. Establish socket connection immediately to prevent disconnect timeouts on refresh.
        const socket = io(SOCKET_URL, { transports: ['websocket'], auth: { token } });
        socketRef.current = socket;

        // 2. Set up all socket event listeners to handle real-time updates.
        socket.on('connect', () => {
          console.log('Socket connected, emitting new-user to rejoin room.');
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

        // 3. Fetch initial room and user data via REST API.
        const [profileRes, roomRes] = await Promise.all([
          axios.get(`${API_BASE}/api/profile/me`, { headers }),
          axios.get(`${API_BASE}/api/rooms/details/${encodeURIComponent(roomId)}`, { headers })
        ]);

        if (!mountedRef.current) return;

        // 4. Set component state from the fetched data.
        setUser(profileRes.data);
        setRoom(roomRes.data);
        
        // Use the database as the source of truth for the contest's finished state on initial load.
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

    // Cleanup function to disconnect socket on component unmount.
    return () => {
      mountedRef.current = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [roomId, navigate]);

  // Effect to auto-scroll the chat window to the latest message.
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // --- Action Handlers ---

  // Handles the "Verify Solution" button click.
  const handleVerify = async () => {
    if (isContestFinished) {
      pushNotification("Cannot verify, the contest is over.");
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

  // Handles sending a chat message.
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || !user) return;
    const payload = { roomId, username: user.username, text: chatMessage.trim() };
    
    // Emit the message to the server; do not update state locally.
    if (socketRef.current) {
      socketRef.current.emit('chat-message', payload);
    }
    
    // Clear the input field.
    setChatMessage('');
  };

  // Handles the "Quit Room" button click.
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

  if (loading) {
    return <div className="text-center mt-5"><Spinner animation="border" /></div>;
  }
  if (error) {
    return <Container className="text-center mt-5"><Alert variant="danger">{error}</Alert></Container>;
  }

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
            <Card.Header as="h4">Contest Room</Card.Header>
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
                    <Button variant="success" onClick={handleVerify} disabled={verifying}>{verifying ? 'Verifying...' : 'Verify Solution'}</Button>
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
