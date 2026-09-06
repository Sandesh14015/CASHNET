/**
 * Settings Page
 * Provider configuration, preferences, and system settings
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Container,
  Grid,
  Typography,
  TextField,
  Select,
  MenuItem,
  Button,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Save } from '@mui/icons-material';
import { getBackendBase } from '@/lib/api-url';

interface ProviderConfig {
  name: string;
  type: string;
  apiKey?: string;
  endpoint?: string;
  enabled: boolean;
}

interface UserPreferences {
  theme: 'light' | 'dark';
  notificationEmail: string;
  dashboardRefreshInterval: number;
  defaultCaseType: string;
}

export const Settings: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>({
    theme: 'light',
    notificationEmail: '',
    dashboardRefreshInterval: 30,
    defaultCaseType: 'crypto_investigation',
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${getBackendBase()}/settings`);
      const data = await response.json();
      setProviders(data.providers || []);
      setPreferences(data.preferences || preferences);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await fetch(`${getBackendBase()}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers, preferences }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const handleProviderChange = (index: number, field: string, value: any) => {
    const updated = [...providers];
    updated[index] = { ...updated[index], [field]: value };
    setProviders(updated);
  };

  const handlePreferenceChange = (field: string, value: any) => {
    setPreferences({ ...preferences, [field]: value });
  };

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      {saved && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Settings saved successfully!
        </Alert>
      )}

      <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 3 }}>
        <Tab label="Provider Configuration" />
        <Tab label="User Preferences" />
        <Tab label="System Settings" />
      </Tabs>

      {/* Provider Configuration Tab */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          {providers.map((provider, idx) => (
            <Grid item xs={12} key={idx}>
              <Card sx={{ p: 3 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Typography variant="h6">{provider.name}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Type"
                      value={provider.type}
                      onChange={(e) => handleProviderChange(idx, 'type', e.target.value)}
                      fullWidth
                      disabled
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={provider.enabled}
                          onChange={(e) =>
                            handleProviderChange(idx, 'enabled', e.target.checked)
                          }
                        />
                      }
                      label="Enabled"
                    />
                  </Grid>
                  {provider.endpoint && (
                    <Grid item xs={12}>
                      <TextField
                        label="Endpoint"
                        value={provider.endpoint}
                        onChange={(e) =>
                          handleProviderChange(idx, 'endpoint', e.target.value)
                        }
                        fullWidth
                      />
                    </Grid>
                  )}
                  {provider.apiKey && (
                    <Grid item xs={12}>
                      <TextField
                        label="API Key"
                        type="password"
                        value={provider.apiKey}
                        onChange={(e) =>
                          handleProviderChange(idx, 'apiKey', e.target.value)
                        }
                        fullWidth
                      />
                    </Grid>
                  )}
                </Grid>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* User Preferences Tab */}
      {tabValue === 1 && (
        <Card sx={{ p: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Select
                value={preferences.theme}
                onChange={(e) => handlePreferenceChange('theme', e.target.value)}
                fullWidth
              >
                <MenuItem value="light">Light Theme</MenuItem>
                <MenuItem value="dark">Dark Theme</MenuItem>
              </Select>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Notification Email"
                type="email"
                value={preferences.notificationEmail}
                onChange={(e) =>
                  handlePreferenceChange('notificationEmail', e.target.value)
                }
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Dashboard Refresh (seconds)"
                type="number"
                value={preferences.dashboardRefreshInterval}
                onChange={(e) =>
                  handlePreferenceChange(
                    'dashboardRefreshInterval',
                    parseInt(e.target.value)
                  )
                }
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Select
                value={preferences.defaultCaseType}
                onChange={(e) =>
                  handlePreferenceChange('defaultCaseType', e.target.value)
                }
                fullWidth
              >
                <MenuItem value="crypto_investigation">Crypto Investigation</MenuItem>
                <MenuItem value="cross_border">Cross Border</MenuItem>
                <MenuItem value="ransomware">Ransomware</MenuItem>
              </Select>
            </Grid>
          </Grid>
        </Card>
      )}

      {/* System Settings Tab */}
      {tabValue === 2 && (
        <Card sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            System Information
          </Typography>
          <Typography variant="body2" color="textSecondary">
            CashNet API Version: 1.0.0
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Database: PostgreSQL
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Last Sync: {new Date().toLocaleString()}
          </Typography>
        </Card>
      )}

      {/* Save Button */}
      <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          onClick={handleSaveSettings}
          startIcon={<Save />}
        >
          Save Changes
        </Button>
        <Button variant="outlined" onClick={fetchSettings}>
          Reset
        </Button>
      </Box>
    </Container>
  );
};

export default Settings;
