import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Alert,
  Typography,
  Divider
} from '@mui/material';
import {
  getLlmSettings,
  updateLlmSettings,
  getReconciliationSettings,
  updateReconciliationSettings
} from '../services/apiServices';

const Profile = () => {
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
  const [lionApiKey, setLionApiKey] = useState('');
  const [lionLlmApiKey, setLionLlmApiKey] = useState('');
  const [lionModelProvider, setLionModelProvider] = useState('');
  const [lionModelName, setLionModelName] = useState('');
  const [lamapiEndpoint, setLamapiEndpoint] = useState('');
  const [lamapiKg, setLamapiKg] = useState('');
  const [lamapiNumCandidates, setLamapiNumCandidates] = useState(10);
  const [lamapiToken, setLamapiToken] = useState('');
  const [lionBaseUrl, setLionBaseUrl] = useState('');
  const [crocodileBaseUrl, setCrocodileBaseUrl] = useState('');
  const [crocodileApiKey, setCrocodileApiKey] = useState('');
  const [lionHasApiKey, setLionHasApiKey] = useState(false);
  const [lionHasLlmApiKey, setLionHasLlmApiKey] = useState(false);
  const [lamapiHasToken, setLamapiHasToken] = useState(false);
  const [crocodileHasApiKey, setCrocodileHasApiKey] = useState(false);
  const [showLionApiKeyInput, setShowLionApiKeyInput] = useState(false);
  const [showLionLlmApiKeyInput, setShowLionLlmApiKeyInput] = useState(false);
  const [showLamapiTokenInput, setShowLamapiTokenInput] = useState(false);
  const [showCrocodileApiKeyInput, setShowCrocodileApiKeyInput] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      setLoading(true);
      try {
        const [data, reconciliation] = await Promise.all([
          getLlmSettings(),
          getReconciliationSettings()
        ]);
        if (!isMounted) return;
        const providers = data?.allowed_providers || [];
        const endpoints = data?.allowed_endpoints || [];
        const providerValid = !data?.provider || providers.length === 0 || providers.includes(data.provider);
        const endpointValid = !data?.endpoint || endpoints.length === 0 || endpoints.includes(data.endpoint);
        setSettings({
          provider: providerValid ? (data?.provider || '') : '',
          model: data?.model || '',
          endpoint: endpointValid ? (data?.endpoint || '') : ''
        });
        setOptions({ providers, endpoints });
        setHasApiKey(Boolean(data?.has_api_key));
        setShowApiKeyInput(!data?.has_api_key);
        const lionHasKey = Boolean(reconciliation?.has_api_key);
        const lionHasLlmKey = Boolean(reconciliation?.has_llm_api_key);
        setLionHasApiKey(lionHasKey);
        setLionHasLlmApiKey(lionHasLlmKey);
        setShowLionApiKeyInput(!lionHasKey);
        setShowLionLlmApiKeyInput(!lionHasLlmKey);
        setLionModelProvider(reconciliation?.model_api_provider || '');
        setLionModelName(reconciliation?.model_name || '');
        setLionBaseUrl(
          reconciliation?.lion_linker?.base_url ||
          reconciliation?.lion_base_url ||
          ''
        );
        setLamapiEndpoint(reconciliation?.lamapi_endpoint || '');
        setLamapiKg(reconciliation?.lamapi_kg || '');
        setLamapiNumCandidates(reconciliation?.lamapi_num_candidates || 10);
        const hasLamapiToken = Boolean(reconciliation?.has_lamapi_token);
        setLamapiHasToken(hasLamapiToken);
        setShowLamapiTokenInput(!hasLamapiToken);
        setCrocodileBaseUrl(
          reconciliation?.crocodile?.base_url ||
          reconciliation?.crocodile_base_url ||
          ''
        );
        const hasCrocKey = Boolean(reconciliation?.crocodile?.has_api_key || reconciliation?.crocodile_has_api_key);
        setCrocodileHasApiKey(hasCrocKey);
        setShowCrocodileApiKeyInput(!hasCrocKey);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError('Failed to load profile settings.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    loadSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        provider: settings.provider || null,
        model: settings.model || null,
        endpoint: settings.endpoint || null
      };
      if (showApiKeyInput && llmApiKey.trim()) {
        payload.api_key = llmApiKey.trim();
      }
      const requests = [updateLlmSettings(payload)];
      const reconRequests = [];
      const lionPayload = {
        provider: 'lion_linker',
        base_url: lionBaseUrl.trim(),
        model_api_provider: lionModelProvider || null,
        model_name: lionModelName || null,
        lamapi_endpoint: lamapiEndpoint || null,
        lamapi_kg: lamapiKg || null,
        lamapi_num_candidates: Number.isFinite(lamapiNumCandidates)
          ? lamapiNumCandidates
          : null
      };
      if (showLionApiKeyInput) {
        lionPayload.api_key = lionApiKey.trim();
      }
      if (showLionLlmApiKeyInput) {
        lionPayload.llm_api_key = lionLlmApiKey.trim();
      }
      if (showLamapiTokenInput && lamapiToken.trim()) {
        lionPayload.lamapi_token = lamapiToken.trim();
      }
      reconRequests.push(updateReconciliationSettings(lionPayload));

      const crocodilePayload = {
        provider: 'crocodile',
        base_url: crocodileBaseUrl.trim()
      };
      if (showCrocodileApiKeyInput && crocodileApiKey.trim()) {
        crocodilePayload.api_key = crocodileApiKey.trim();
      }
      reconRequests.push(updateReconciliationSettings(crocodilePayload));

      const responses = await Promise.all([...requests, ...reconRequests]);
      const updated = responses[0];
      const updatedRecon = reconRequests.length > 0 ? responses[responses.length - 1] : null;
      setHasApiKey(Boolean(updated?.has_api_key));
      setLlmApiKey('');
      setShowApiKeyInput(false);
      if (updatedRecon) {
        setLionHasApiKey(Boolean(updatedRecon?.has_api_key));
        setLionHasLlmApiKey(Boolean(updatedRecon?.has_llm_api_key));
        setLamapiHasToken(Boolean(updatedRecon?.has_lamapi_token));
        setCrocodileHasApiKey(Boolean(updatedRecon?.crocodile?.has_api_key || updatedRecon?.crocodile_has_api_key));
      }
      setLionApiKey('');
      setLionLlmApiKey('');
      setLamapiToken('');
      setCrocodileApiKey('');
      if (showLionApiKeyInput) {
        setShowLionApiKeyInput(false);
      }
      if (showLionLlmApiKeyInput) {
        setShowLionLlmApiKeyInput(false);
      }
      if (showLamapiTokenInput) {
        setShowLamapiTokenInput(false);
      }
      if (showCrocodileApiKeyInput) {
        setShowCrocodileApiKeyInput(false);
      }
      setSuccess('Profile updated.');
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to update profile.');
    }
  };

  if (loading) {
    return (
      <Box sx={{ m: 2 }}>
        <Typography variant="body1">Loading profile…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ m: 2 }}>
      <Card elevation={3}>
        <CardHeader
          title="Profile"
          subheader="Manage your LLM settings used for auto-identification."
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
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              {options.providers.length > 0 ? (
                <FormControl fullWidth>
                  <InputLabel>LLM provider</InputLabel>
                  <Select
                    label="LLM provider"
                    value={settings.provider}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      provider: e.target.value
                    }))}
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
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    provider: e.target.value
                  }))}
                  helperText="No providers configured on the server."
                />
              )}
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="LLM model"
                fullWidth
                value={settings.model}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  model: e.target.value
                }))}
                helperText="Leave blank to use the server default."
              />
            </Grid>
            {options.endpoints.length > 0 && (
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>LLM endpoint</InputLabel>
                  <Select
                    label="LLM endpoint"
                    value={settings.endpoint}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      endpoint: e.target.value
                    }))}
                  >
                    <MenuItem value="">
                      Server default
                    </MenuItem>
                    {options.endpoints.map((endpoint) => (
                      <MenuItem key={endpoint} value={endpoint}>{endpoint}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
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
                Configure credentials used for reconciliation jobs.
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Lion Linker model provider"
                fullWidth
                value={lionModelProvider}
                placeholder="openrouter"
                onChange={(e) => setLionModelProvider(e.target.value)}
                helperText="Leave blank to use the server default."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Lion Linker model name"
                fullWidth
                value={lionModelName}
                placeholder="gpt-oss-120b"
                onChange={(e) => setLionModelName(e.target.value)}
                helperText="Leave blank to use the server default."
              />
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
            <Grid item xs={12}>
              {!showLionLlmApiKeyInput && lionHasLlmApiKey ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Lion Linker LLM API key is stored for your profile.
                  </Typography>
                  <Button size="small" onClick={() => setShowLionLlmApiKeyInput(true)}>
                    Update key
                  </Button>
                </Box>
              ) : (
                <TextField
                  label="Lion Linker LLM API key"
                  type="password"
                  fullWidth
                  value={lionLlmApiKey}
                  placeholder={lionHasLlmApiKey ? 'Stored in profile (leave blank to keep)' : 'Enter LLM API key'}
                  onChange={(e) => setLionLlmApiKey(e.target.value)}
                  helperText={lionHasLlmApiKey ? 'Key is stored for your profile.' : 'Key will be stored for your profile.'}
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
              <Typography variant="body2" color="text.secondary">
                Configure credentials for the Crocodile reconciler.
              </Typography>
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
          </Grid>
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={handleSave}>
              Save profile
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Profile;
