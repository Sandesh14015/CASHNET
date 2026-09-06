/**
 * Model Analysis Page
 * Interactive page to test ML models and view predictions
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Container,
  Grid,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { modelService } from '../services/modelService';

interface PredictionResult {
  model_id: number;
  prediction: number;
  confidence: number;
  timestamp: string;
  error?: string;
}

export const ModelAnalysis: React.FC = () => {
  const [selectedModel, setSelectedModel] = useState<number>(182);
  const [riskScore, setRiskScore] = useState<string>('0.5');
  const [transactionCount, setTransactionCount] = useState<string>('100');
  const [amount, setAmount] = useState<string>('10000');
  const [ageDays, setAgeDays] = useState<string>('30');
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [modelStatus, setModelStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModelStatus();
  }, []);

  const fetchModelStatus = async () => {
    try {
      const status = await modelService.getModelStatus();
      setModelStatus(status);
    } catch (err: any) {
      setError(`Failed to fetch model status: ${err.message}`);
    }
  };

  const handlePredict = async () => {
    setLoading(true);
    setError(null);

    try {
      const record = {
        risk_score: parseFloat(riskScore) || 0.5,
        transaction_count: parseInt(transactionCount) || 100,
        amount: parseFloat(amount) || 10000,
        age_days: parseInt(ageDays) || 30,
      };

      let result: PredictionResult;

      if (selectedModel === 182) {
        result = await modelService.predictModel182(record);
      } else if (selectedModel === 183) {
        result = await modelService.predictModel183(record);
      } else {
        result = await modelService.predictModel184(record);
      }

      setPredictions([result, ...predictions]);
    } catch (err: any) {
      setError(`Prediction error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getModelName = (modelId: number): string => {
    switch (modelId) {
      case 182:
        return 'Crypto/VASP/Cross-Border (182)';
      case 183:
        return 'AML Detection (183)';
      case 184:
        return 'Complaint Typology (184)';
      default:
        return `Model ${modelId}`;
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return '#4caf50';
    if (confidence >= 0.6) return '#ff9800';
    return '#f44336';
  };

  const isModelHealthy = (modelId: number): boolean => {
    if (!modelStatus) return false;
    const status = modelStatus[modelId];
    return status && status.loaded;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        ML Model Analysis & Testing
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Model Selection & Input */}
        <Grid item xs={12} md={6}>
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Prediction Input
            </Typography>

            <Select
              fullWidth
              value={selectedModel}
              onChange={(e: any) => setSelectedModel(e.target.value as number)}
              sx={{ mb: 2 }}
            >
              <MenuItem value={182}>Model 182 - Crypto/VASP/Cross-Border</MenuItem>
              <MenuItem value={183}>Model 183 - AML Detection</MenuItem>
              <MenuItem value={184}>Model 184 - Complaint Typology</MenuItem>
            </Select>

            {/* Model Health */}
            <Box sx={{ mb: 2, p: 1, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="body2" color={isModelHealthy(selectedModel) ? 'success.main' : 'error.main'}>
                {isModelHealthy(selectedModel) ? '✓ Model Ready' : '✗ Model Unavailable'}
              </Typography>
            </Box>

            <TextField
              fullWidth
              label="Risk Score (0-1)"
              type="number"
              value={riskScore}
              onChange={(e: any) => setRiskScore(e.target.value)}
              inputProps={{ step: '0.1', min: '0', max: '1' }}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Transaction Count"
              type="number"
              value={transactionCount}
              onChange={(e: any) => setTransactionCount(e.target.value)}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Amount ($)"
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Age (Days)"
              type="number"
              value={ageDays}
              onChange={(e: any) => setAgeDays(e.target.value)}
              sx={{ mb: 2 }}
            />

            <Button
              variant="contained"
              fullWidth
              onClick={handlePredict}
              disabled={loading || !isModelHealthy(selectedModel)}
            >
              {loading ? <CircularProgress size={24} /> : 'Get Prediction'}
            </Button>
          </Card>
        </Grid>

        {/* Model Status */}
        <Grid item xs={12} md={6}>
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Model Status
            </Typography>

            {modelStatus ? (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Model</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Accuracy</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[182, 183, 184].map((modelId) => {
                    const status = modelStatus[modelId];
                    return (
                      <TableRow key={modelId}>
                        <TableCell>{modelId}</TableCell>
                        <TableCell>
                          {status?.loaded ? (
                            <span style={{ color: '#4caf50' }}>✓ Ready</span>
                          ) : (
                            <span style={{ color: '#f44336' }}>✗ Unavailable</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {status?.metadata?.accuracy
                            ? `${(status.metadata.accuracy * 100).toFixed(1)}%`
                            : 'N/A'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <CircularProgress />
            )}

            <Button
              variant="outlined"
              fullWidth
              onClick={fetchModelStatus}
              sx={{ mt: 2 }}
            >
              Refresh Status
            </Button>
          </Card>
        </Grid>

        {/* Prediction History */}
        {predictions.length > 0 && (
          <Grid item xs={12}>
            <Card sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Prediction History ({predictions.length})
              </Typography>

              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableCell>Model</TableCell>
                    <TableCell>Prediction</TableCell>
                    <TableCell>Confidence</TableCell>
                    <TableCell>Timestamp</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {predictions.map((pred, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{getModelName(pred.model_id)}</TableCell>
                      <TableCell>{pred.prediction}</TableCell>
                      <TableCell>
                        <Box
                          sx={{
                            backgroundColor: getConfidenceColor(pred.confidence),
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            textAlign: 'center',
                          }}
                        >
                          {(pred.confidence * 100).toFixed(1)}%
                        </Box>
                      </TableCell>
                      <TableCell>
                        {new Date(pred.timestamp).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default ModelAnalysis;
