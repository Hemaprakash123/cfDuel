import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Container, Row, Col, Card, ListGroup, Button, Spinner, Alert, Badge, Form, InputGroup } from 'react-bootstrap';

const RoomPage = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [chatMessage, setChatMessage] = useState('');
    const [chatMessages, setChatMessages] = useState([]); // Placeholder for chat messages

    // Mock problem data - this will be replaced with data from the backend later
    const mockProblem = {
        name: "A. Theatre Square",
        difficulty: 1000,
        tags: ["math", "implementation"],
        contestId: 1,
        index: "A"
    };

    useEffect(() => {
        const fetchRoomDetails = async () => {
            setError('');
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { 'x-auth-token': token } };
                const res = await axios.get(`http://localhost:5000/api/rooms/details/${roomId}`, config);
                setRoom(res.data);
            } catch (err) {
                setError('Could not fetch room details. It may have been deleted or the ID is incorrect.');
            } finally {
                setLoading(false);
            }
        };
        fetchRoomDetails();
    }, [roomId]);

    const handleQuitRoom = async () => {
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'x-auth-token': token } };
            await axios.post('http://localhost:5000/api/rooms/leave', { roomId }, config);
            navigate('/home');
        } catch (err) {
            setError('Failed to leave the room. Please try again.');
        }
    };
    
    const handleSendMessage = (e) => {
        e.preventDefault();
        if (chatMessage.trim()) {
            // This is where you would emit the message via Socket.IO
            // For now, we'll just add it to our local state for UI purposes
            setChatMessages([...chatMessages, { user: 'You', text: chatMessage }]);
            setChatMessage('');
        }
    };

    if (loading) {
        return <div className="text-center mt-5"><Spinner animation="border" /></div>;
    }

    if (error) {
        return (
            <Container className="text-center mt-5">
                <Alert variant="danger">{error}</Alert>
                <Button variant="primary" onClick={() => navigate('/home')}>Go to Home</Button>
            </Container>
        );
    }

    return (
        <Container fluid>
            <Row>
                {/* Main Contest Area */}
                <Col md={8}>
                    <Card>
                        <Card.Header as="h4">Problem 1 of {room.settings.problemCount}</Card.Header>
                        <Card.Body>
                            <Card.Title className="d-flex justify-content-between align-items-center">
                                <span>{mockProblem.name}</span>
                                <Badge bg="secondary">{mockProblem.difficulty}</Badge>
                            </Card.Title>
                            <div className="mb-3">
                                {mockProblem.tags.map(tag => <Badge pill bg="info" key={tag} className="me-1">{tag}</Badge>)}
                            </div>
                            <p>The contest is waiting to start. When the host starts the match, the problem will be revealed here.</p>
                            <div className="d-grid gap-2 d-md-flex">
                                <Button 
                                    variant="primary" 
                                    href={`https://codeforces.com/problemset/problem/${mockProblem.contestId}/${mockProblem.index}`} 
                                    target="_blank"
                                >
                                    View on Codeforces
                                </Button>
                                <Button variant="success">Verify Solution</Button>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>

                {/* Side Panel */}
                <Col md={4}>
                    <Card className="mb-3">
                        <Card.Header as="h5">Scoreboard</Card.Header>
                        <ListGroup variant="flush">
                            {room.participants.map(p => (
                                <ListGroup.Item key={p._id} className="d-flex justify-content-between align-items-center">
                                    {p.username} {p._id === room.host ? <Badge bg="warning" text="dark">Host</Badge> : ''}
                                    <Badge bg="primary" pill>0</Badge>
                                </ListGroup.Item>
                            ))}
                        </ListGroup>
                    </Card>

                    <Card className="mb-3">
                        <Card.Header as="h5">Live Chat</Card.Header>
                        <Card.Body style={{ height: '250px', overflowY: 'auto' }}>
                            {/* Chat messages will be displayed here */}
                            {chatMessages.map((msg, index) => (
                                <p key={index}><strong>{msg.user}:</strong> {msg.text}</p>
                            ))}
                             <p className="text-muted">Chat is not yet connected...</p>
                        </Card.Body>
                        <Card.Footer>
                             <Form onSubmit={handleSendMessage}>
                                <InputGroup>
                                    <Form.Control 
                                        placeholder="Type a message..." 
                                        value={chatMessage}
                                        onChange={(e) => setChatMessage(e.target.value)}
                                    />
                                    <Button variant="outline-secondary" type="submit">Send</Button>
                                </InputGroup>
                            </Form>
                        </Card.Footer>
                    </Card>
                    
                    <Alert variant="info">
                        <strong>Room ID:</strong> {room.roomId}
                    </Alert>

                    <div className="d-grid">
                        <Button variant="danger" onClick={handleQuitRoom}>Quit Room</Button>
                    </div>
                </Col>
            </Row>
        </Container>
    );
};
export default RoomPage;