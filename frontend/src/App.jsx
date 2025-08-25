import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, Navigate, useNavigate } from 'react-router-dom';
import Signup from './components/Signup.jsx';
import Login from './components/Login.jsx';
import ProfilePage from './components/ProfilePage.jsx';
import HomePage from './components/HomePage.jsx';
import CreateRoomPage from './components/CreateRoomPage.jsx';
import RoomPage from './components/RoomPage.jsx'; // <-- NEW
import { Navbar, Container, Nav, Spinner } from 'react-bootstrap';
import axios from 'axios';

import 'bootstrap/dist/css/bootstrap.min.css';

// This component handles the initial loading and redirection logic
const AppWrapper = () => {
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const token = localStorage.getItem('token');

    useEffect(() => {
        const checkUserStatus = async () => {
            if (token) {
                try {
                    const config = { headers: { 'x-auth-token': token } };
                    const res = await axios.get('http://localhost:5000/api/profile/me', config);
                    if (res.data.currentRoomId) {
                        navigate(`/room/${res.data.currentRoomId}`);
                    }
                } catch (error) {
                    // Invalid token, clear it
                    localStorage.removeItem('token');
                    navigate('/login');
                }
            }
            setLoading(false);
        };
        checkUserStatus();
    }, [token, navigate]);

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ height: "100vh" }}>
                <Spinner animation="border" />
            </div>
        );
    }

    return (
        <>
            <Navbar bg="dark" variant="dark" expand="lg">
                <Container>
                    <Navbar.Brand as={Link} to={token ? "/home" : "/login"}>BlitzCup</Navbar.Brand>
                    <Navbar.Toggle aria-controls="basic-navbar-nav" />
                    <Navbar.Collapse id="basic-navbar-nav">
                        <Nav className="ms-auto">
                            {token ? (
                                <>
                                    <Nav.Link as={Link} to="/home">Home</Nav.Link>
                                    <Nav.Link as={Link} to="/profile">Profile</Nav.Link>
                                    <Nav.Link onClick={() => {
                                        localStorage.removeItem('token');
                                        navigate('/login');
                                    }}>Logout</Nav.Link>
                                </>
                            ) : (
                                <>
                                    <Nav.Link as={Link} to="/login">Login</Nav.Link>
                                    <Nav.Link as={Link} to="/signup">Sign Up</Nav.Link>
                                </>
                            )}
                        </Nav>
                    </Navbar.Collapse>
                </Container>
            </Navbar>
            <main className="py-4">
                <Container>
                    <Routes>
                        <Route path="/signup" element={<Signup />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/profile" element={token ? <ProfilePage /> : <Navigate to="/login" />} />
                        <Route path="/home" element={token ? <HomePage /> : <Navigate to="/login" />} />
                        <Route path="/create-room" element={token ? <CreateRoomPage /> : <Navigate to="/login" />} />
                        <Route path="/room/:roomId" element={token ? <RoomPage /> : <Navigate to="/login" />} />
                        <Route path="/" element={token ? <HomePage /> : <Login />} />
                    </Routes>
                </Container>
            </main>
        </>
    );
};

// App now just wraps the AppWrapper with the Router
function App() {
    return (
        <Router>
            <AppWrapper />
        </Router>
    );
}

export default App;