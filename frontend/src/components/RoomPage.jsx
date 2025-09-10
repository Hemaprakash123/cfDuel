import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Container, Row, Col, Card, ListGroup, Button, Spinner, Alert, Badge,
  Form, InputGroup, Toast, ToastContainer
} from "react-bootstrap";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SOCKET_URL = API_BASE;

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [user, setUser] = useState(null);
  const [currentProblem, setCurrentProblem] = useState(null);
  const [scores, setScores] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isContestFinished, setIsContestFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);

  const socketRef = useRef(null);
  const chatScrollRef = useRef(null);

  function pushNotification(msg) {
    if (!msg) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setNotifications(prev => [{ id, msg, show: true }, ...prev.slice(0, 4)]);
  }

  const formatTime = (seconds) => {
    if (seconds === null || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    const headers = { "x-auth-token": token };

    async function init() {
      setLoading(true);
      try {
        const [profileRes, roomRes] = await Promise.all([
          axios.get(`${API_BASE}/api/profile/me`, { headers }),
          axios.get(`${API_BASE}/api/rooms/details/${roomId}`, { headers })
        ]);

        const roomData = roomRes.data;
        setUser(profileRes.data);
        setRoom(roomData);
        setChatMessages(roomData.chat || []);
        setScores(new Map(Object.entries(roomData.scores || {})));

        if (!roomData.contestIsActive) {
          setIsContestFinished(true);
        } else if (roomData.problems && roomData.problems.length > 0) {
          setCurrentProblem(roomData.problems[roomData.currentProblemIndex]);
        }

        // Setup socket after fetching initial data
        const socket = io(SOCKET_URL, { auth: { token } });
        socketRef.current = socket;

        socket.on('connect', () => {
          socket.emit('join-room', { roomId });
        });

        socket.on('notification', msg => pushNotification(msg));
        socket.on('new-problem', prob => setCurrentProblem(prob));
        socket.on('score-update', updatedScores => setScores(new Map(Object.entries(updatedScores || {}))));
        socket.on('chat-message', msg => setChatMessages(prev => [...prev, msg]));
        socket.on('contest-finished', ({ scores: finalScores }) => {
            setIsContestFinished(true);
            setCurrentProblem(null);
            if (finalScores) setScores(new Map(Object.entries(finalScores)));
        });
        socket.on('countdown', ({ remaining }) => setTimeLeft(remaining));
        socket.on('time-up', () => {
            setTimeLeft(0);
            pushNotification("Time's up!");
        });

      } catch (err) {
        console.error('RoomPage init error', err);
        setError('Could not fetch room details. The room may not exist or the server is down.');
      } finally {
        setLoading(false);
      }
    }

    init();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId, navigate]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleVerify = async () => {
    if (isContestFinished) {
      pushNotification("Cannot verify, the contest is over.");
      return;
    }
    setVerifying(true);
    const token = localStorage.getItem('token');
    try {
      const res = await axios.post(`${API_BASE}/api/rooms/verify`, { roomId }, { headers: { 'x-auth-token': token } });
      pushNotification(res.data?.msg || 'Verification successful!');
    } catch (err) {
      pushNotification(err?.response?.data?.msg || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || !socketRef.current) return;
    socketRef.current.emit('chat-message', { roomId, text: chatMessage.trim() });
    setChatMessage('');
  };

  const handleQuitRoom = async () => {
    const token = localStorage.getItem('token');
    try {
      await axios.post(`${API_BASE}/api/rooms/leave`, { roomId }, { headers: { 'x-auth-token': token } });
    } finally {
      if (socketRef.current) socketRef.current.disconnect();
      navigate('/home');
    }
  };

  if (loading) return <div className="text-center mt-5"><Spinner animation="border" /></div>;
  if (error) return <Container className="text-center mt-5"><Alert variant="danger">{error}</Alert></Container>;

  const sortedScores = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <Container fluid className="p-3">
      <ToastContainer position="top-end" className="p-3">
        {notifications.map(t => (
          <Toast key={t.id} onClose={() => setNotifications(p => p.filter(n => n.id !== t.id))} show={t.show} delay={5000} autohide>
            <Toast.Header><strong className="me-auto">Notification</strong></Toast.Header>
            <Toast.Body>{t.msg}</Toast.Body>
          </Toast>
        ))}
      </ToastContainer>

      <Row>
        <Col md={8}>
          <Card>
            <Card.Header as="h4" className="d-flex justify-content-between align-items-center">
              <span>Contest Room: {room?.roomId}</span>
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
                  <p>Thanks for playing. Check out the final scores.</p>
                </>
              ) : currentProblem ? (
                <>
                  <Card.Title className="d-flex justify-content-between align-items-center">
                    <span>{currentProblem.name}</span>
                    <Badge bg="secondary">{currentProblem.points}</Badge>
                  </Card.Title>
                  <div className="mb-3">{(currentProblem.tags || []).map(tag => <Badge pill bg="info" key={tag} className="me-1">{tag}</Badge>)}</div>
                  <p>Solve the problem on Codeforces and click Verify.</p>
                  <div className="d-grid gap-2 d-md-flex">
                    <Button variant="primary" href={currentProblem.url} target="_blank" rel="noreferrer">View Problem</Button>
                    <Button variant="success" onClick={handleVerify} disabled={verifying}>
                        {verifying ? 'Verifying...' : 'Verify Solution'}
                    </Button>
                  </div>
                </>
              ) : (
                <Card.Title>Waiting for contest to start...</Card.Title>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="mb-3">
            <Card.Header as="h5">Scoreboard</Card.Header>
            <ListGroup variant="flush">
              {sortedScores.length > 0 ? (
                sortedScores.map(([username, score]) => (
                  <ListGroup.Item key={username} className="d-flex justify-content-between">
                    <strong>{username}</strong>
                    <Badge bg="primary" pill>{score}</Badge>
                  </ListGroup.Item>
                ))
              ) : (
                <ListGroup.Item>No scores yet.</ListGroup.Item>
              )}
            </ListGroup>
          </Card>
          <Card>
            <Card.Header as="h5">Live Chat</Card.Header>
            <Card.Body style={{ height: '250px', overflowY: 'auto' }} ref={chatScrollRef}>
              {chatMessages.map((m, i) => <p key={i}><strong>{m.username}:</strong> {m.text}</p>)}
            </Card.Body>
            <Card.Footer>
              <Form onSubmit={handleSendMessage}>
                <InputGroup>
                  <Form.Control placeholder="Type..." value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} />
                  <Button variant="outline-secondary" type="submit">Send</Button>
                </InputGroup>
              </Form>
            </Card.Footer>
          </Card>
          <div className="d-grid mt-3">
            <Button variant="danger" onClick={handleQuitRoom}>Quit Room</Button>
          </div>
        </Col>
      </Row>
    </Container>
  );
}
