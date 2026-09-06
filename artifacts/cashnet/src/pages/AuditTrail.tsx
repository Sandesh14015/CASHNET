/**
 * Audit Trail Page
 * Displays immutable audit logs and compliance tracking
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Container,
  Grid,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Button,
  CircularProgress,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import { getBackendBase } from '@/lib/api-url';

interface AuditEvent {
  eventId: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes?: Record<string, any>;
  status: 'success' | 'failure';
}

export const AuditTrail: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    fetchAuditEvents();
  }, [filterAction, filterStatus]);

  const fetchAuditEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const urlParams = new URLSearchParams(window.location.search);
      const caseId = urlParams.get('caseId');
      
      if (caseId) params.append('caseId', caseId);
      if (filterAction) params.append('action', filterAction);
      if (filterStatus) params.append('status', filterStatus);

      const response = await fetch(`${getBackendBase()}/audit-trail?${params.toString()}`);
      const data = await response.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error('Error fetching audit events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadLog = async () => {
    try {
      const response = await fetch(`${getBackendBase()}/audit-trail/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'csv' }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-trail-${new Date().toISOString()}.csv`;
        a.click();
      }
    } catch (error) {
      console.error('Error exporting audit log:', error);
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'success' ? '#4caf50' : '#f44336';
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Grid container spacing={2} sx={{ mb: 4 }} alignItems="center">
        <Grid item xs={12} sm={6}>
          <Typography variant="h4">Audit Trail</Typography>
        </Grid>
        <Grid item xs={12} sm={6} sx={{ textAlign: 'right' }}>
          <Button
            variant="outlined"
            onClick={handleDownloadLog}
            startIcon={<Download />}
          >
            Export Log
          </Button>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Action Filter"
              value={filterAction}
              onChange={(e: any) => setFilterAction(e.target.value)}
              fullWidth
              placeholder="e.g., CREATE, UPDATE, DELETE"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Status Filter"
              value={filterStatus}
              onChange={(e: any) => setFilterStatus(e.target.value)}
              fullWidth
              placeholder="success or failure"
            />
          </Grid>
        </Grid>
      </Card>

      {/* Audit Events Table */}
      <Card>
        {loading ? (
          <Grid sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Grid>
        ) : (
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell>Timestamp</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.length > 0 ? (
                events.map((event) => (
                  <TableRow key={event.eventId} hover>
                    <TableCell>
                      {new Date(event.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>{event.userId}</TableCell>
                    <TableCell>{event.action}</TableCell>
                    <TableCell>
                      {event.resourceType}/{event.resourceId}
                    </TableCell>
                    <TableCell>
                      <span style={{ color: getStatusColor(event.status) }}>
                        {event.status.toUpperCase()}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', py: 3 }}>
                    No audit events found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </Container>
  );
};

export default AuditTrail;
