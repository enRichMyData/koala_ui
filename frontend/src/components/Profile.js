import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import {
  getLlmSettings,
  getCurrentUser,
  getReconciliationSettings,
  updateLlmSettings,
  updateReconciliationSettings
} from '../services/apiServices';
import AdminUsersTab from './AdminUsersTab';

const Profile = () => {
  const [isAdmin, setIsAdmin] = useState((localStorage.getItem('userRole') || 'user') === 'admin');
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [settings, setSettings] = useState({
    provider: '',
    model: '',
    endpoint: ''
  });
  const [options, setOptions] = useState({
    providers: [],
    endpoints: []
  });
  const [llmApiKey, setLlmApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  const [lionBaseUrl, setLionBaseUrl] = useState('');
  const [lionApiKey, setLionApiKey] = useState('');
  const [lionHasApiKey, setLionHasApiKey] = useState(false);
  const [showLionApiKeyInput, setShowLionApiKeyInput] = useState(false);
  const [lamapiEndpoint, setLamapiEndpoint] = useState('');
  const [lamapiKg, setLamapiKg] = useState('');
  const [lamapiNumCandidates, setLamapiNumCandidates] = useState(10);
  const [lamapiToken, setLamapiToken] = useState('');
  const [lamapiHasToken, setLamapiHasToken] = useState(false);
  const [showLamapiTokenInput, setShowLamapiTokenInput] = useState(false);

  const [crocodileBaseUrl, setCrocodileBaseUrl] = useState('');
  const [crocodileApiKey, setCrocodileApiKey] = useState('');
  const [crocodileHasApiKey, setCrocodileHasApiKey] = useState(false);
  const [showCrocodileApiKeyInput, setShowCrocodileApiKeyInput] = useState(false);

  const [mooseBaseUrl, setMooseBaseUrl] = useState('');
  const [mooseApiKey, setMooseApiKey] = useState('');
  const [mooseHasApiKey, setMooseHasApiKey] = useState(false);
  const [showMooseApiKeyInput, setShowMooseApiKeyInput] = useState(false);

  const applyLoadedSettings = useCallback((llmData, reconciliationData) => {
    const providers = llmData?.allowed_providers || [];
    const endpoints = llmData?.allowed_endpoints || [];
    const providerValid = !llmData?.provider || providers.length === 0 || providers.includes(llmData.provider);
    const endpointValid = !llmData?.endpoint || endpoints.length === 0 || endpoints.includes(llmData.endpoint);
    setSettings({
      provider: providerValid ? (llmData?.provider || '') : '',
      model: llmData?.model || '',
      endpoint: endpointValid ? (llmData?.endpoint || '') : ''
    });
    setOptions({ providers, endpoints });
    setHasApiKey(Boolean(llmData?.has_api_key));
    setShowApiKeyInput(!llmData?.has_api_key);
    setLlmApiKey('');

    const lion = reconciliationData?.lion_linker || {};
    setLionBaseUrl(lion?.base_url || reconciliationData?.lion_base_url || '');
    setLionHasApiKey(Boolean(lion?.has_api_key || reconciliationData?.has_api_key));
    setShowLionApiKeyInput(!(lion?.has_api_key || reconciliationData?.has_api_key));
    setLionApiKey('');

    setLamapiEndpoint(lion?.lamapi_endpoint || reconciliationData?.lamapi_endpoint || '');
    setLamapiKg(lion?.lamapi_kg || reconciliationData?.lamapi_kg || '');
    setLamapiNumCandidates(lion?.lamapi_num_candidates || reconciliationData?.lamapi_num_candidates || 10);
    setLamapiHasToken(Boolean(lion?.has_lamapi_token || reconciliationData?.has_lamapi_token));
    setShowLamapiTokenInput(!(lion?.has_lamapi_token || reconciliationData?.has_lamapi_token));
    setLamapiToken('');

    const crocodile = reconciliationData?.crocodile || {};
    setCrocodileBaseUrl(crocodile?.base_url || reconciliationData?.crocodile_base_url || '');
    setCrocodileHasApiKey(Boolean(crocodile?.has_api_key || reconciliationData?.crocodile_has_api_key));
    setShowCrocodileApiKeyInput(!(crocodile?.has_api_key || reconciliationData?.crocodile_has_api_key));
    setCrocodileApiKey('');

    const moose = reconciliationData?.moose || {};
    setMooseBaseUrl(moose?.base_url || reconciliationData?.moose_base_url || '');
    setMooseHasApiKey(Boolean(moose?.has_api_key || reconciliationData?.moose_has_api_key));
    setShowMooseApiKeyInput(!(moose?.has_api_key || reconciliationData?.moose_has_api_key));
    setMooseApiKey('');
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [me, llmData, reconciliationData] = await Promise.all([
        getCurrentUser(),
        getLlmSettings(),
        getReconciliationSettings()
      ]);
      const role = me?.role || 'user';
      localStorage.setItem('userRole', role);
      setIsAdmin(role === 'admin');
      applyLoadedSettings(llmData, reconciliationData);
      setError(null);
    } catch (err) {
      setIsAdmin(false);
      setError('Failed to load profile settings.');
    } finally {
      setLoading(false);
    }
  }, [applyLoadedSettings]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    try {
      const llmPayload = {
        provider: settings.provider || null,
        model: settings.model || null,
        endpoint: settings.endpoint || null
      };
      if (showApiKeyInput && llmApiKey.trim()) {
        llmPayload.api_key = llmApiKey.trim();
      }

      const lionPayload = {
        provider: 'lion_linker',
        base_url: lionBaseUrl.trim(),
        lamapi_endpoint: lamapiEndpoint || null,
        lamapi_kg: lamapiKg || null,
        lamapi_num_candidates: Number.isFinite(lamapiNumCandidates)
          ? lamapiNumCandidates
          : null
      };
      if (showLionApiKeyInput && lionApiKey.trim()) {
        lionPayload.api_key = lionApiKey.trim();
      }
      if (showLamapiTokenInput && lamapiToken.trim()) {
        lionPayload.lamapi_token = lamapiToken.trim();
      }

      const crocodilePayload = {
        provider: 'crocodile',
        base_url: crocodileBaseUrl.trim()
      };
      if (showCrocodileApiKeyInput && crocodileApiKey.trim()) {
        crocodilePayload.api_key = crocodileApiKey.trim();
      }

      const moosePayload = {
        provider: 'moose',
        base_url: mooseBaseUrl.trim()
      };
      if (showMooseApiKeyInput && mooseApiKey.trim()) {
        moosePayload.api_key = mooseApiKey.trim();
      }

      await Promise.all([
        updateLlmSettings(llmPayload),
        updateReconciliationSettings(lionPayload),
        updateReconciliationSettings(crocodilePayload),
        updateReconciliationSettings(moosePayload)
      ]);

      await loadSettings();
      setSuccess('Profile updated.');
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to update profile.');
    }
  };

  if (loading) {
    return (
      <Box sx={{ m: 2 }}>
        <Typography variant="body1">Loading profile...</Typography>
      </Box>
    );
  }

  const profileSettingsContent = (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography variant="subtitle1">Shared LLM</Typography>
        <Typography variant="body2" color="text.secondary">
          This configuration is reused by both Moose and Lion Linker.
        </Typography>
      </Grid>
      <Grid item xs={12} md={6}>
        {options.providers.length > 0 ? (
          <FormControl fullWidth>
            <InputLabel>LLM provider</InputLabel>
            <Select
              label="LLM provider"
              value={settings.provider}
              onChange={(e) => setSettings((prev) => ({ ...prev, provider: e.target.value }))}
            >
              <MenuItem value="">
                Server default
              </MenuItem>
              {options.providers.map((provider) => (
                <MenuItem key={provider} value={provider}>{provider}</MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            label="LLM provider"
            fullWidth
            value={settings.provider}
            onChange={(e) => setSettings((prev) => ({ ...prev, provider: e.target.value }))}
          />
        )}
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          label="LLM model"
          fullWidth
          value={settings.model}
          onChange={(e) => setSettings((prev) => ({ ...prev, model: e.target.value }))}
          helperText="Leave blank to use the server default."
        />
      </Grid>
      <Grid item xs={12} md={6}>
        {options.endpoints.length > 0 ? (
          <FormControl fullWidth>
            <InputLabel>LLM endpoint</InputLabel>
            <Select
              label="LLM endpoint"
              value={settings.endpoint}
              onChange={(e) => setSettings((prev) => ({ ...prev, endpoint: e.target.value }))}
            >
              <MenuItem value="">
                Server default
              </MenuItem>
              {options.endpoints.map((endpoint) => (
                <MenuItem key={endpoint} value={endpoint}>{endpoint}</MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            label="LLM endpoint"
            fullWidth
            value={settings.endpoint}
            onChange={(e) => setSettings((prev) => ({ ...prev, endpoint: e.target.value }))}
            helperText="Leave blank to use the server default."
          />
        )}
      </Grid>
      <Grid item xs={12}>
        {!showApiKeyInput && hasApiKey ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              LLM API key is stored for your profile.
            </Typography>
            <Button size="small" onClick={() => setShowApiKeyInput(true)}>
              Update key
            </Button>
          </Box>
        ) : (
          <TextField
            label="LLM API key"
            type="password"
            fullWidth
            value={llmApiKey}
            placeholder={hasApiKey ? 'Stored in profile (leave blank to keep)' : 'Enter API key'}
            onChange={(e) => setLlmApiKey(e.target.value)}
            helperText={hasApiKey ? 'Key is stored for your profile.' : 'Key will be stored for your profile.'}
          />
        )}
      </Grid>

      <Grid item xs={12}>
        <Divider sx={{ my: 1 }} />
      </Grid>
      <Grid item xs={12}>
        <Typography variant="subtitle1">Lion Linker</Typography>
        <Typography variant="body2" color="text.secondary">
          Configure endpoint and retriever details. LLM credentials come from the shared section above.
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="Lion Linker base URL"
          fullWidth
          value={lionBaseUrl}
          placeholder="https://lion.zooverse.dev"
          onChange={(e) => setLionBaseUrl(e.target.value)}
          helperText="Leave blank to use the server default."
        />
      </Grid>
      <Grid item xs={12}>
        {!showLionApiKeyInput && lionHasApiKey ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Lion Linker API key is stored for your profile.
            </Typography>
            <Button size="small" onClick={() => setShowLionApiKeyInput(true)}>
              Update key
            </Button>
          </Box>
        ) : (
          <TextField
            label="Lion Linker API key"
            type="password"
            fullWidth
            value={lionApiKey}
            placeholder={lionHasApiKey ? 'Stored in profile (leave blank to keep)' : 'Enter API key'}
            onChange={(e) => setLionApiKey(e.target.value)}
            helperText={lionHasApiKey ? 'Key is stored for your profile.' : 'Key will be stored for your profile.'}
          />
        )}
      </Grid>
      <Grid item xs={12} md={8}>
        <TextField
          label="Lamapi endpoint"
          fullWidth
          value={lamapiEndpoint}
          placeholder="https://lamapi.hel.sintef.cloud/lookup/entity-retrieval"
          onChange={(e) => setLamapiEndpoint(e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField
          label="Lamapi KG"
          fullWidth
          value={lamapiKg}
          placeholder="wikidata"
          onChange={(e) => setLamapiKg(e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField
          label="Lamapi candidates"
          type="number"
          fullWidth
          value={lamapiNumCandidates}
          inputProps={{ min: 1, max: 100 }}
          onChange={(e) => setLamapiNumCandidates(Number(e.target.value) || 1)}
        />
      </Grid>
      <Grid item xs={12} md={8}>
        {!showLamapiTokenInput && lamapiHasToken ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Lamapi token is stored for your profile.
            </Typography>
            <Button size="small" onClick={() => setShowLamapiTokenInput(true)}>
              Update token
            </Button>
          </Box>
        ) : (
          <TextField
            label="Lamapi token"
            type="password"
            fullWidth
            value={lamapiToken}
            placeholder={lamapiHasToken ? 'Stored in profile (leave blank to keep)' : 'Enter Lamapi token'}
            onChange={(e) => setLamapiToken(e.target.value)}
            helperText={lamapiHasToken ? 'Token is stored for your profile.' : 'Token will be stored for your profile.'}
          />
        )}
      </Grid>

      <Grid item xs={12}>
        <Divider sx={{ my: 1 }} />
      </Grid>
      <Grid item xs={12}>
        <Typography variant="subtitle1">Crocodile</Typography>
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="Crocodile base URL"
          fullWidth
          value={crocodileBaseUrl}
          placeholder="https://crocodile.zooverse.dev"
          onChange={(e) => setCrocodileBaseUrl(e.target.value)}
          helperText="Leave blank to use the server default."
        />
      </Grid>
      <Grid item xs={12}>
        {!showCrocodileApiKeyInput && crocodileHasApiKey ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Crocodile API key is stored for your profile.
            </Typography>
            <Button size="small" onClick={() => setShowCrocodileApiKeyInput(true)}>
              Update key
            </Button>
          </Box>
        ) : (
          <TextField
            label="Crocodile API key"
            type="password"
            fullWidth
            value={crocodileApiKey}
            placeholder={crocodileHasApiKey ? 'Stored in profile (leave blank to keep)' : 'Enter Crocodile API key'}
            onChange={(e) => setCrocodileApiKey(e.target.value)}
            helperText={crocodileHasApiKey ? 'Key is stored for your profile.' : 'Key will be stored for your profile.'}
          />
        )}
      </Grid>

      <Grid item xs={12}>
        <Divider sx={{ my: 1 }} />
      </Grid>
      <Grid item xs={12}>
        <Typography variant="subtitle1">Moose</Typography>
        <Typography variant="body2" color="text.secondary">
          Configure Moose endpoint credentials. Moose reuses the shared LLM setup above.
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="Moose base URL"
          fullWidth
          value={mooseBaseUrl}
          placeholder="https://moose.zooverse.dev"
          onChange={(e) => setMooseBaseUrl(e.target.value)}
          helperText="Leave blank to use the server default."
        />
      </Grid>
      <Grid item xs={12}>
        {!showMooseApiKeyInput && mooseHasApiKey ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Moose API key is stored for your profile.
            </Typography>
            <Button size="small" onClick={() => setShowMooseApiKeyInput(true)}>
              Update key
            </Button>
          </Box>
        ) : (
          <TextField
            label="Moose API key"
            type="password"
            fullWidth
            value={mooseApiKey}
            placeholder={mooseHasApiKey ? 'Stored in profile (leave blank to keep)' : 'Enter Moose API key'}
            onChange={(e) => setMooseApiKey(e.target.value)}
            helperText={mooseHasApiKey ? 'Key is stored for your profile.' : 'Key will be stored for your profile.'}
          />
        )}
      </Grid>
      <Grid item xs={12}>
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" onClick={handleSave}>
            Save profile
          </Button>
        </Box>
      </Grid>
    </Grid>
  );

  return (
    <Box sx={{ m: 2 }}>
      <Card elevation={3}>
        <CardHeader
          title="Profile"
          subheader="Manage shared LLM and service endpoints."
        />
        <CardContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          {isAdmin && (
            <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 2 }}>
              <Tab label="Profile settings" />
              <Tab label="User admin" />
            </Tabs>
          )}

          {(!isAdmin || activeTab === 0) && profileSettingsContent}
          {isAdmin && activeTab === 1 && <AdminUsersTab />}
        </CardContent>
      </Card>
    </Box>
  );
};

export default Profile;
