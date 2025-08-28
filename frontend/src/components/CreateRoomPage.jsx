import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Form, Button, Card, Alert, Container, Row, Col } from 'react-bootstrap';

const CreateRoomPage = () => {
    const [settings, setSettings] = useState({ problemCount: 5, minDifficulty: 800, maxDifficulty: 1200, timer: 60 });
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { problemCount, minDifficulty, maxDifficulty, timer } = settings;
    const onChange = e => setSettings({ ...settings, [e.target.name]: e.target.value });
    // src/components/CreateRoomPage.jsx - only the onSubmit part changed
    // ... keep rest of your file, replace the onSubmit try section with:

    const onSubmit = async e => {
        e.preventDefault();
        setError('');
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const token = localStorage.getItem('token');
            const config = { headers: { 'Content-Type': 'application/json', 'x-auth-token': token } };
            const res = await axios.post(`${API_URL}/api/rooms/create`, settings, config);
            // persist so refresh reconnects
            localStorage.setItem('blitzcup_roomId', res.data.roomId);
            navigate(`/room/${res.data.roomId}`);
        } catch (err) {
            setError(err.response?.data?.msg || 'Failed to create room.');
        }
    };

    return (
        <Container><Row className="justify-content-md-center mt-5"><Col xs={12} md={8}><Card><Card.Body>
            <h2 className="text-center mb-4">Create New Room</h2>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form onSubmit={onSubmit}>
                <Form.Group id="problemCount" className="mt-3"><Form.Label>Number of Problems</Form.Label><Form.Select name="problemCount" value={problemCount} onChange={onChange}>
                    {[...Array(10).keys()].map(n => (<option key={n + 1} value={n + 1}>{n + 1}</option>))}
                </Form.Select></Form.Group>
                <Row className="mt-3">
                    <Col><Form.Group id="minDifficulty"><Form.Label>Min Difficulty</Form.Label><Form.Control type="number" name="minDifficulty" value={minDifficulty} onChange={onChange} required step="100" min="800" /></Form.Group></Col>
                    <Col><Form.Group id="maxDifficulty"><Form.Label>Max Difficulty</Form.Label><Form.Control type="number" name="maxDifficulty" value={maxDifficulty} onChange={onChange} required step="100" min="800" /></Form.Group></Col>
                </Row>
                <Form.Group id="timer" className="mt-3"><Form.Label>Timer (in minutes)</Form.Label><Form.Control type="number" name="timer" value={timer} onChange={onChange} required min="5" /></Form.Group>
                <Button className="w-100 mt-4" type="submit">Create Challenge</Button>
            </Form>
        </Card.Body></Card></Col></Row></Container>
    );
};
export default CreateRoomPage;
