import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';

// Helper component for SVG icons to keep the main component clean
const Icon = ({ path, size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '10px', color: '#0d6efd' }}>
    <path d={path}></path>
  </svg>
);

const About = () => {
  const steps = [
    { icon: "M12 9v3m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z", title: "Create a Room", description: "Set your problem difficulty, timer, and challenge size." },
    { icon: "M18 9v3m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z", title: "Invite a Friend", description: "Share the unique room code to start the duel." },
    { icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", title: "Wait for the Duel", description: "The match begins automatically once your friend joins." },
    { icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", title: "Solve & Compete", description: "Scores update in real-time as you solve problems." }
  ];

  return (
    <Container>
      <Row className="justify-content-md-center mt-5">
        <Col xs={12} md={10}>
          <Card style={{ borderRadius: '15px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)', border: 'none', padding: '1rem' }}>
            <Card.Body>
              <h2 className="text-center mb-3" style={{ fontWeight: 700, color: '#2c3e50' }}>About Blitzforces</h2>
              <Card.Text className="text-center text-muted mb-4" style={{ maxWidth: '600px', margin: '0 auto 2rem auto' }}>
                Inspired by the thrilling Codeforces Blitz Cup, this app lets you challenge friends to quick, head-to-head competitive programming duels anytime.
              </Card.Text>
              
              <hr className="my-4" />

              <h4 className="text-center mb-4" style={{ fontWeight: 600, color: '#34495e' }}>How to Play</h4>
              
              <Row>
                {steps.map((step, index) => (
                  <Col key={index} md={3} xs={6} className="text-center mb-4">
                    <Icon path={step.icon} size={32} />
                    <p className="mb-1" style={{ fontWeight: 600 }}>{step.title}</p>
                    <small className="text-muted">{step.description}</small>
                  </Col>
                ))}
              </Row>

            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default About;
