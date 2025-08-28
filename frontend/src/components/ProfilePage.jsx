import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, ListGroup, Button, Container, Row, Col, Spinner } from 'react-bootstrap';

const ProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const config = {
          headers: { 'x-auth-token': token },
        };
        const res = await axios.get(`${API_URL}/api/profile/me`, config);
        setProfile(res.data);
      } catch (err) {
        console.error('Failed to fetch profile', err);
        localStorage.removeItem('token');
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);
  
  const handleLogout = () => {
      localStorage.removeItem('token');
      navigate('/login');
  };

  if (loading) {
    return (
        <div className="d-flex justify-content-center mt-5">
            <Spinner animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
            </Spinner>
        </div>
    );
  }

  if (!profile) {
    return <div>Could not load profile. Please try logging in again.</div>;
  }

  return (
    <Container>
        <Row className="justify-content-md-center">
            <Col md={8}>
                <Card className="mb-4">
                    <Card.Header as="h2">{profile.username}'s Profile</Card.Header>
                    <ListGroup variant="flush">
                        <ListGroup.Item><strong>Email:</strong> {profile.email}</ListGroup.Item>
                        <ListGroup.Item><strong>Username:</strong> {profile.username}</ListGroup.Item>
                        <ListGroup.Item><strong>Codeforces Handle:</strong> {profile.codeforcesUsername}</ListGroup.Item>
                    </ListGroup>
                </Card>

                <Card>
                    <Card.Header as="h3">Match History</Card.Header>
                    <Card.Body>
                        {profile.matchHistory && profile.matchHistory.length > 0 ? (
                            <ListGroup>
                            {profile.matchHistory.map((match, index) => (
                                <ListGroup.Item key={index}>
                                Match against {match.opponent} - Result: {match.result}
                                </ListGroup.Item>
                            ))}
                            </ListGroup>
                        ) : (
                            <Card.Text>No matches played yet.</Card.Text>
                        )}
                    </Card.Body>
                </Card>
                 <Button variant="danger" onClick={handleLogout} className="mt-4">
                    Logout
                </Button>
            </Col>
        </Row>
    </Container>
  );
};

export default ProfilePage;
