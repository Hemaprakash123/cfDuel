import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Button, Card, Alert, Container, Row, Col } from 'react-bootstrap';

const Signup = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    codeforcesUsername: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const { username, email, password, codeforcesUsername } = formData;

  const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async e => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
        setError('Password must be at least 6 characters long');
        return;
    }
    try {
      const res = await axios.post('http://localhost:5000/api/auth/register', formData);
      localStorage.setItem('token', res.data.token);
      navigate('/profile');
    } catch (err) {
      setError(err.response?.data?.msg || 'An error occurred. Please try again.');
    }
  };

  return (
    <Container>
      <Row className="justify-content-md-center mt-5">
        <Col xs={12} md={6}>
          <Card>
            <Card.Body>
              <h2 className="text-center mb-4">Sign Up</h2>
              {error && <Alert variant="danger">{error}</Alert>}
              <Form onSubmit={onSubmit}>
                <Form.Group id="username">
                  <Form.Label>Username</Form.Label>
                  <Form.Control type="text" name="username" value={username} onChange={onChange} required />
                </Form.Group>
                <Form.Group id="email"  className="mt-3">
                  <Form.Label>Email</Form.Label>
                  <Form.Control type="email" name="email" value={email} onChange={onChange} required />
                </Form.Group>
                <Form.Group id="password"  className="mt-3">
                  <Form.Label>Password</Form.Label>
                  <Form.Control type="password" name="password" value={password} onChange={onChange} required />
                </Form.Group>
                <Form.Group id="codeforcesUsername" className="mt-3">
                  <Form.Label>Codeforces Username</Form.Label>
                  <Form.Control type="text" name="codeforcesUsername" value={codeforcesUsername} onChange={onChange} required />
                </Form.Group>
                <Button className="w-100 mt-4" type="submit">Sign Up</Button>
              </Form>
            </Card.Body>
          </Card>
          <div className="w-100 text-center mt-2">
            Already have an account? <Link to="/login">Log In</Link>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default Signup;
