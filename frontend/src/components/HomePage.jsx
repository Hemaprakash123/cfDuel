import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Form, InputGroup, Alert } from 'react-bootstrap';
import axios from 'axios';

const HomePage = () => {
    const [roomIdInput, setRoomIdInput] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleJoinRoom = async (e) => {
        e.preventDefault();
        setError('');
        if (!roomIdInput.trim()) {
            setError('Please enter a Room ID.');
            return;
        }
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'x-auth-token': token } };
            await axios.post('http://localhost:5000/api/rooms/join', { roomId: roomIdInput.toUpperCase() }, config);
            // save for reconnect
            localStorage.setItem('blitzcup_roomId', roomIdInput.toUpperCase());
            navigate(`/room/${roomIdInput.toUpperCase()}`);
        } catch (err) {
            setError(err.response?.data?.msg || 'Could not join room. Please check the ID.');
        }
    };


    return (
        <Container className="text-center mt-5">
            <Row className="justify-content-md-center"><Col md={8}>
                <h1>Welcome to BlitzCup</h1>
                <p className="lead text-muted">The ultimate 1v1 competitive programming arena.</p>
            </Col></Row>
            <Row className="justify-content-md-center mt-4">
                <Col md={5} className="mb-3">
                    <Card className="h-100">
                        <Card.Body className="d-flex flex-column justify-content-between">
                            <Card.Title>Create a New Room</Card.Title>
                            <Card.Text>Set up a new challenge, define the rules, and invite your opponent.</Card.Text>
                            <Button variant="primary" size="lg" onClick={() => navigate('/create-room')}>Create Room</Button>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={5}>
                    <Card className="h-100">
                        <Card.Body className="d-flex flex-column justify-content-between">
                            <Card.Title>Join an Existing Room</Card.Title>
                            <Card.Text>Have a room code? Enter it here to join the battle.</Card.Text>
                            {error && <Alert variant="danger" className="mt-2">{error}</Alert>}
                            <Form onSubmit={handleJoinRoom}>
                                <InputGroup>
                                    <Form.Control
                                        placeholder="Enter Room ID"
                                        value={roomIdInput}
                                        onChange={(e) => setRoomIdInput(e.target.value)}
                                    />
                                    <Button variant="success" type="submit">Join Room</Button>
                                </InputGroup>
                            </Form>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </Container>
    );
};

export default HomePage;