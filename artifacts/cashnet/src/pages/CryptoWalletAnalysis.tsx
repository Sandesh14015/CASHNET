/**
 * Crypto Wallet Analysis Page
 * Displays wallet transaction flows, risk scoring, and VASP attribution
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Dialog,
} from '@mui/material';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getBackendBase } from '@/lib/api-url';

interface WalletData {
  address: string;
  blockchain: string;
  balance: number;
  transactionCount: number;
  riskScore: number;
  lastActive: string;
}

interface TransactionFlow {
  from: string;
  to: string;
  amount: number;
  timestamp: string;
  blockchain: string;
  status: string;
}

export const CryptoWalletAnalysis: React.FC = () => {
  const [walletAddress, setWalletAddress] = useState('');
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<TransactionFlow[]>([]);
  const [loading, setLoading] = useState(false);
  const [riskChartData, setRiskChartData] = useState<any[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionFlow | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress) return;

    setLoading(true);
    try {
      // Call API to fetch wallet analysis
      const response = await fetch(`${getBackendBase()}/wallets/analyze/${walletAddress}`);
      const data = await response.json();
      
      setWalletData({
        address: walletAddress,
        blockchain: data.blockchain || 'bitcoin',
        balance: data.balance || 0,
        transactionCount: data.transactionCount || 0,
        riskScore: data.riskScore || 0,
        lastActive: data.lastActive || new Date().toISOString(),
      });

      // Fetch transaction history
      const txResponse = await fetch(`${getBackendBase()}/wallets/${walletAddress}/transactions`);
      const txData = await txResponse.json();
      setTransactions(txData.transactions || []);

      // Prepare risk over time chart data
      setRiskChartData(data.riskHistory || []);
    } catch (error) {
      console.error('Error fetching wallet analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (score: number): string => {
    if (score >= 0.8) return '#d32f2f';
    if (score >= 0.6) return '#f57c00';
    if (score >= 0.4) return '#fbc02d';
    return '#388e3c';
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Crypto Wallet Analysis
      </Typography>

      {/* Search Form */}
      <Card sx={{ mb: 4, p: 3 }}>
        <form onSubmit={handleSearch}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="Wallet Address"
                value={walletAddress}
                onChange={(e: any) => setWalletAddress(e.target.value)}
                placeholder="Enter Bitcoin or Ethereum address..."
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Button
                variant="contained"
                fullWidth
                type="submit"
                disabled={loading}
                sx={{ height: '100%' }}
              >
                {loading ? <CircularProgress size={24} /> : 'Analyze'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Card>

      {walletData && (
        <>
          {/* Summary Cards */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ p: 2 }}>
                <Typography color="textSecondary" gutterBottom>
                  Balance
                </Typography>
                <Typography variant="h6">
                  {walletData.balance.toFixed(8)} BTC
                </Typography>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ p: 2 }}>
                <Typography color="textSecondary" gutterBottom>
                  Transaction Count
                </Typography>
                <Typography variant="h6">
                  {walletData.transactionCount}
                </Typography>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ p: 2 }}>
                <Typography color="textSecondary" gutterBottom>
                  Risk Score
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ color: getRiskColor(walletData.riskScore) }}
                >
                  {(walletData.riskScore * 100).toFixed(1)}%
                </Typography>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ p: 2 }}>
                <Typography color="textSecondary" gutterBottom>
                  Last Active
                </Typography>
                <Typography variant="h6">
                  {new Date(walletData.lastActive).toLocaleDateString()}
                </Typography>
              </Card>
            </Grid>
          </Grid>

          {/* Risk Over Time Chart */}
          {riskChartData.length > 0 && (
            <Card sx={{ mb: 4, p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Risk Score Trend
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={riskChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="riskScore" stroke="#8884d8" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Transaction Table */}
          <Card sx={{ mb: 4 }}>
            <Typography variant="h6" sx={{ p: 2 }}>
              Transaction History ({transactions.length})
            </Typography>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell>From</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell>Amount (BTC)</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.slice(0, 10).map((tx, idx) => (
                  <TableRow
                    key={idx}
                    onClick={() => setSelectedTransaction(tx)}
                    sx={{ cursor: 'pointer', '&:hover': { backgroundColor: '#f5f5f5' } }}
                  >
                    <TableCell>{tx.from.substring(0, 16)}...</TableCell>
                    <TableCell>{tx.to.substring(0, 16)}...</TableCell>
                    <TableCell>{tx.amount.toFixed(8)}</TableCell>
                    <TableCell>{new Date(tx.timestamp).toLocaleDateString()}</TableCell>
                    <TableCell>{tx.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {/* Transaction Detail Dialog */}
      <Dialog open={!!selectedTransaction} onClose={() => setSelectedTransaction(null)} maxWidth="sm" fullWidth>
        {selectedTransaction && (
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Transaction Details
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <strong>From:</strong> {selectedTransaction.from}
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <strong>To:</strong> {selectedTransaction.to}
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <strong>Amount:</strong> {selectedTransaction.amount} BTC
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <strong>Date:</strong> {new Date(selectedTransaction.timestamp).toLocaleString()}
            </Typography>
            <Button variant="contained" onClick={() => setSelectedTransaction(null)} fullWidth>
              Close
            </Button>
          </Card>
        )}
      </Dialog>
    </Container>
  );
};

export default CryptoWalletAnalysis;
