/**
 * VASP Attribution Page
 * Displays ranked VASP candidates with confidence scores and attribution logic
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Container,
  Grid,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  Chip,
} from '@mui/material';
import { getBackendBase } from '@/lib/api-url';

interface VASPCandidate {
  vaspName: string;
  confidence: number;
  factors: string[];
  jurisdiction: string;
  verified: boolean;
}

export const VASPAttribution: React.FC = () => {
  const [caseId, setCaseId] = useState('');
  const [candidates, setCandidates] = useState<VASPCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('caseId');
    if (id) {
      setCaseId(id);
      fetchCandidates(id);
    }
  }, []);

  const fetchCandidates = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${getBackendBase()}/cases/${id}/vasp-attribution`);
      const data = await response.json();
      setCandidates(data.candidates || []);
    } catch (error) {
      console.error('Error fetching VASP candidates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjudication = async (vaspName: string, approved: boolean) => {
    try {
      await fetch(`${getBackendBase()}/cases/${caseId}/adjudicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaspName, approved }),
      });
      // Refresh candidates
      fetchCandidates(caseId);
    } catch (error) {
      console.error('Error recording adjudication:', error);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        VASP Attribution Analysis
      </Typography>

      <Grid container spacing={3}>
        {candidates.length > 0 ? (
          candidates.map((candidate, idx) => (
            <Grid item xs={12} key={idx}>
              <Card sx={{ p: 3 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6}>
                    <Typography variant="h6">{candidate.vaspName}</Typography>
                    <Typography color="textSecondary" variant="body2">
                      Jurisdiction: {candidate.jurisdiction}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="body2" gutterBottom>
                      Confidence Score
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={candidate.confidence * 100}
                    />
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {(candidate.confidence * 100).toFixed(1)}%
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    {candidate.verified ? (
                      <Chip label="Verified" color="success" />
                    ) : (
                      <Chip label="Unverified" variant="outlined" />
                    )}
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" gutterBottom>
                      Contributing Factors:
                    </Typography>
                    {candidate.factors.map((factor, fidx) => (
                      <Chip key={fidx} label={factor} size="small" sx={{ mr: 1 }} />
                    ))}
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      onClick={() => handleAdjudication(candidate.vaspName, true)}
                      sx={{ mr: 1 }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => handleAdjudication(candidate.vaspName, false)}
                    >
                      Reject
                    </Button>
                  </Grid>
                </Grid>
              </Card>
            </Grid>
          ))
        ) : (
          <Grid item xs={12}>
            <Typography>No VASP candidates found.</Typography>
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default VASPAttribution;
