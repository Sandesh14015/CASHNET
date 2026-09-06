/**
 * Reports Page
 * Displays case findings, evidence summaries, and exportable reports
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Container,
  Grid,
  Typography,
  Button,
  Select,
  MenuItem,
  TextField,
  Dialog,
  CircularProgress,
} from '@mui/material';
import { FileDownload, Print } from '@mui/icons-material';
import { getBackendBase } from '@/lib/api-url';

interface Report {
  reportId: string;
  caseId: string;
  title: string;
  createdAt: string;
  format: 'pdf' | 'json' | 'xlsx';
  status: 'draft' | 'finalized' | 'archived';
}

export const Reports: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'json' | 'xlsx'>('pdf');
  const [exportDialog, setExportDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const response = await fetch(`${getBackendBase()}/reports`);
      const data = await response.json();
      setReports(data.reports || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const caseId = urlParams.get('caseId');
      
      const response = await fetch(`${getBackendBase()}/cases/${caseId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: selectedFormat }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `case-report.${selectedFormat === 'pdf' ? 'pdf' : selectedFormat}`;
        a.click();
        setExportDialog(false);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Grid container spacing={2} sx={{ mb: 4 }} alignItems="center">
        <Grid item xs={12} sm={6}>
          <Typography variant="h4">Reports & Findings</Typography>
        </Grid>
        <Grid item xs={12} sm={6} sx={{ textAlign: 'right' }}>
          <Button
            variant="contained"
            onClick={() => setExportDialog(true)}
            startIcon={<FileDownload />}
          >
            Export Report
          </Button>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {reports.length > 0 ? (
          reports.map((report) => (
            <Grid item xs={12} key={report.reportId}>
              <Card sx={{ p: 3 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6}>
                    <Typography variant="h6">{report.title}</Typography>
                    <Typography color="textSecondary" variant="body2">
                      Created: {new Date(report.createdAt).toLocaleDateString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="body2">
                      Format: {report.format.toUpperCase()}
                    </Typography>
                    <Typography variant="body2">
                      Status: {report.status}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Button variant="outlined" size="small" startIcon={<FileDownload />}>
                      Download
                    </Button>
                  </Grid>
                </Grid>
              </Card>
            </Grid>
          ))
        ) : (
          <Grid item xs={12}>
            <Typography>No reports available.</Typography>
          </Grid>
        )}
      </Grid>

      {/* Export Dialog */}
      <Dialog open={exportDialog} onClose={() => setExportDialog(false)} maxWidth="sm" fullWidth>
        <Card sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Export Report
          </Typography>
          <Select
            value={selectedFormat}
            onChange={(e: any) => setSelectedFormat(e.target.value as any)}
            fullWidth
            sx={{ mb: 2 }}
          >
            <MenuItem value="pdf">PDF</MenuItem>
            <MenuItem value="json">JSON</MenuItem>
            <MenuItem value="xlsx">Excel</MenuItem>
          </Select>
          <Button
            variant="contained"
            fullWidth
            onClick={handleExport}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Export'}
          </Button>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => setExportDialog(false)}
            sx={{ mt: 1 }}
          >
            Cancel
          </Button>
        </Card>
      </Dialog>
    </Container>
  );
};

export default Reports;
