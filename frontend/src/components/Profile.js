import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
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

const DEFAULT_RECONCILER_ORDER = ['lion_linker', 'crocodile', 'refined', 'wikidata'];

const PROVIDER_LABEL_OVERRIDES = {
  lion_linker: 'Lion Linker',
  crocodile: 'Crocodile',
  refined: 'ReFinED',
  wikidata: 'Wikidata Reconciler'
};

const LION_FALLBACK_FIELDS = [
  {
    key: 'lamapi_endpoint',
    label: 'Lamapi endpoint',
    type: 'text',
    required: true,
    placeholder: 'https://lamapi.hel.sintef.cloud/lookup/entity-retrieval'
  },
  {
    key: 'lamapi_kg',
    label: 'Lamapi KG',
    type: 'text',
    required: false,
    placeholder: 'wikidata'
  },
  {
    key: 'lamapi_num_candidates',
    label: 'Lamapi candidates',
    type: 'number',
    required: false,
    min: 1,
    max: 100
  },
  {
    key: 'lamapi_token',
    label: 'Lamapi token',
    type: 'password',
    required: true,
    sensitive: true
  }
];

const getProviderLabel = (providerId, providerData = null) => {
  if (providerData?.label) return providerData.label;
  if (PROVIDER_LABEL_OVERRIDES[providerId]) return PROVIDER_LABEL_OVERRIDES[providerId];
  if (!providerId) return 'Reconciler';
  return providerId
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getDefaultProviderMissing = (providerId, providerData = {}) => {
  const missing = [];
  const label = getProviderLabel(providerId, providerData);
  if (providerData?.requiresApiKey && !providerData?.hasApiKey) {
    missing.push(`${label} API key`);
  }
  if (providerId === 'lion_linker' && !providerData?.hasLamapiToken) {
    missing.push('Lamapi token');
  }
  return missing;
};

const buildReconcilerForms = (reconciliationData = {}) => {
  const rawProviders = reconciliationData?.reconciler_providers || reconciliationData?.reconcilers || {};
  const rawOrder = reconciliationData?.reconciler_provider_order ||
    reconciliationData?.available_providers ||
    Object.keys(rawProviders);
  const order = Array.isArray(rawOrder) && rawOrder.length > 0
    ? rawOrder
    : DEFAULT_RECONCILER_ORDER;
  const forms = {};

  order.forEach((providerId) => {
    const providerData = rawProviders?.[providerId] || reconciliationData?.[providerId] || {};
    const hasApiKey = Boolean(
      providerData?.has_api_key ||
      (providerId === 'lion_linker' ? reconciliationData?.has_api_key : false) ||
      (providerId === 'crocodile' ? reconciliationData?.crocodile_has_api_key : false) ||
      (providerId === 'refined' ? reconciliationData?.refined_has_api_key : false) ||
      (providerId === 'wikidata' ? reconciliationData?.wikidata_has_api_key : false)
    );
    const hasLamapiToken = Boolean(
      providerData?.has_lamapi_token ||
      (providerId === 'lion_linker' ? reconciliationData?.has_lamapi_token : false)
    );
    const requiresApiKey = providerData?.requires_api_key !== undefined
      ? Boolean(providerData.requires_api_key)
      : providerId !== 'wikidata';
    const usesSharedLlm = Boolean(providerData?.uses_shared_llm || providerId === 'lion_linker');
    let fields = Array.isArray(providerData?.fields) ? providerData.fields : [];
    if (fields.length === 0 && providerId === 'lion_linker') {
      fields = LION_FALLBACK_FIELDS;
    }
    const fieldValues = providerData?.field_values || {};
    const values = {};
    const sensitiveFields = {};

    fields.forEach((field) => {
      const fieldKey = field?.key;
      if (!fieldKey) return;
      const isSensitive = Boolean(field?.sensitive || field?.type === 'password');
      if (isSensitive) {
        const hasValue = Boolean(
          fieldValues?.[fieldKey]?.has_value ||
          (fieldKey === 'lamapi_token'
            ? (providerData?.has_lamapi_token || reconciliationData?.has_lamapi_token)
            : false)
        );
        sensitiveFields[fieldKey] = {
          hasValue,
          showInput: !hasValue,
          value: ''
        };
        return;
      }

      let value = fieldValues?.[fieldKey];
      if (value === undefined || value === null) {
        if (fieldKey === 'lamapi_endpoint') {
          value = providerData?.lamapi_endpoint || reconciliationData?.lamapi_endpoint || '';
        } else if (fieldKey === 'lamapi_kg') {
          value = providerData?.lamapi_kg || reconciliationData?.lamapi_kg || '';
        } else if (fieldKey === 'lamapi_num_candidates') {
          value = providerData?.lamapi_num_candidates ||
            reconciliationData?.lamapi_num_candidates ||
            10;
        } else {
          value = '';
        }
      }
      values[fieldKey] = value;
    });

    const missing = Array.isArray(providerData?.missing) && providerData.missing.length > 0
      ? providerData.missing.filter(Boolean)
      : getDefaultProviderMissing(providerId, { requiresApiKey, hasApiKey, hasLamapiToken, label: providerData?.label });

    forms[providerId] = {
      id: providerId,
      label: getProviderLabel(providerId, providerData),
      description: providerData?.description || '',
      baseUrl: providerData?.base_url || reconciliationData?.[`${providerId}_base_url`] || '',
      hasApiKey,
      apiKey: '',
      showApiKeyInput: !hasApiKey,
      requiresApiKey,
      usesSharedLlm,
      hasLamapiToken,
      fields,
      values,
      sensitiveFields,
      missing
    };
  });

  return { order, forms };
};

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

  const [reconcilerOrder, setReconcilerOrder] = useState(DEFAULT_RECONCILER_ORDER);
  const [reconcilerForms, setReconcilerForms] = useState({});
  const [selectedReconcilerId, setSelectedReconcilerId] = useState('');
  const [reconcilerSearch, setReconcilerSearch] = useState('');

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

    const { order, forms } = buildReconcilerForms(reconciliationData || {});
    setReconcilerOrder(order);
    setReconcilerForms(forms);

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

  const filteredReconcilerOrder = useMemo(() => {
    const query = (reconcilerSearch || '').trim().toLowerCase();
    if (!query) return reconcilerOrder;
    return reconcilerOrder.filter((providerId) => {
      const form = reconcilerForms?.[providerId];
      const label = (form?.label || '').toLowerCase();
      const description = (form?.description || '').toLowerCase();
      return label.includes(query) || description.includes(query) || providerId.toLowerCase().includes(query);
    });
  }, [reconcilerOrder, reconcilerForms, reconcilerSearch]);

  useEffect(() => {
    if (!filteredReconcilerOrder.length) {
      setSelectedReconcilerId('');
      return;
    }
    if (!selectedReconcilerId || !filteredReconcilerOrder.includes(selectedReconcilerId)) {
      setSelectedReconcilerId(filteredReconcilerOrder[0]);
    }
  }, [filteredReconcilerOrder, selectedReconcilerId]);

  const selectedReconcilerForm = selectedReconcilerId
    ? reconcilerForms?.[selectedReconcilerId] || null
    : null;

  const updateReconcilerForm = (providerId, updater) => {
    setReconcilerForms((prev) => {
      const current = prev?.[providerId] || {};
      const next = typeof updater === 'function' ? updater(current) : updater;
      return {
        ...prev,
        [providerId]: {
          ...current,
          ...next
        }
      };
    });
  };

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

      const providerPayloads = reconcilerOrder
        .map((providerId) => {
          const form = reconcilerForms?.[providerId];
          if (!form) return null;
          const providerPayload = {
            provider: providerId,
            base_url: form.baseUrl?.trim() || null
          };
          if (form.showApiKeyInput && form.apiKey.trim()) {
            providerPayload.api_key = form.apiKey.trim();
          }
          (form.fields || []).forEach((field) => {
            const fieldKey = field?.key;
            if (!fieldKey) return;
            const isSensitive = Boolean(field?.sensitive || field?.type === 'password');
            if (isSensitive) {
              const sensitiveState = form.sensitiveFields?.[fieldKey];
              if (sensitiveState?.showInput && sensitiveState?.value?.trim()) {
                providerPayload[fieldKey] = sensitiveState.value.trim();
              }
              return;
            }

            const rawValue = form.values?.[fieldKey];
            if (field?.type === 'number') {
              const parsed = Number(rawValue);
              providerPayload[fieldKey] = Number.isFinite(parsed) ? parsed : null;
              return;
            }
            const cleaned = rawValue === undefined || rawValue === null
              ? ''
              : String(rawValue).trim();
            providerPayload[fieldKey] = cleaned || null;
          });
          return providerPayload;
        })
        .filter(Boolean);

      const moosePayload = {
        provider: 'moose',
        base_url: mooseBaseUrl.trim()
      };
      if (showMooseApiKeyInput && mooseApiKey.trim()) {
        moosePayload.api_key = mooseApiKey.trim();
      }

      await Promise.all([
        updateLlmSettings(llmPayload),
        ...providerPayloads.map((providerPayload) => updateReconciliationSettings(providerPayload)),
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
          This configuration is reused by Moose and reconcilers that require shared LLM settings.
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
        <Typography variant="subtitle1">Reconciliation services</Typography>
        <Typography variant="body2" color="text.secondary">
          Configure one reconciler at a time. Use search to quickly find a provider as the list grows.
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
              <TextField
                size="small"
                fullWidth
                label="Find reconciler"
                placeholder="Search by name"
                value={reconcilerSearch}
                onChange={(e) => setReconcilerSearch(e.target.value)}
                sx={{ mb: 1.5 }}
              />
              <List
                dense
                disablePadding
                sx={{
                  maxHeight: 440,
                  overflowY: 'auto',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1
                }}
              >
                {filteredReconcilerOrder.map((providerId) => {
                  const form = reconcilerForms?.[providerId];
                  if (!form) return null;
                  const missingCount = [...new Set((form.missing || []).filter(Boolean))].length;
                  const selected = providerId === selectedReconcilerId;
                  return (
                    <ListItemButton
                      key={`reconciler-item-${providerId}`}
                      selected={selected}
                      onClick={() => setSelectedReconcilerId(providerId)}
                      sx={{ alignItems: 'flex-start', py: 1 }}
                    >
                      <ListItemText
                        primary={form.label}
                        secondary={form.description || providerId}
                        primaryTypographyProps={{ fontWeight: selected ? 600 : 500 }}
                        secondaryTypographyProps={{ sx: { mt: 0.25 } }}
                      />
                      <Chip
                        size="small"
                        color={missingCount > 0 ? 'warning' : 'success'}
                        variant="outlined"
                        label={missingCount > 0 ? `${missingCount} missing` : 'ready'}
                        sx={{ ml: 1, mt: 0.25 }}
                      />
                    </ListItemButton>
                  );
                })}
                {filteredReconcilerOrder.length === 0 && (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      No reconcilers match your search.
                    </Typography>
                  </Box>
                )}
              </List>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {filteredReconcilerOrder.length} of {reconcilerOrder.length} visible
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={8}>
            {!selectedReconcilerForm ? (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Select a reconciler from the list to edit its settings.
                </Typography>
              </Paper>
            ) : (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1">{selectedReconcilerForm.label}</Typography>
                  {selectedReconcilerForm.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {selectedReconcilerForm.description}
                    </Typography>
                  )}
                  {selectedReconcilerForm.usesSharedLlm && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Uses shared LLM settings above.
                    </Typography>
                  )}
                  {[...new Set((selectedReconcilerForm.missing || []).filter(Boolean))].length > 0 && (
                    <Alert severity="warning" sx={{ mb: 1 }}>
                      Missing: {[...new Set((selectedReconcilerForm.missing || []).filter(Boolean))].join(', ')}
                    </Alert>
                  )}
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        label={`${selectedReconcilerForm.label} base URL`}
                        fullWidth
                        value={selectedReconcilerForm.baseUrl}
                        onChange={(e) => updateReconcilerForm(selectedReconcilerId, { baseUrl: e.target.value })}
                        helperText="Leave blank to use the server default."
                      />
                    </Grid>
                    <Grid item xs={12}>
                      {!selectedReconcilerForm.showApiKeyInput && selectedReconcilerForm.hasApiKey ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Typography variant="body2" color="text.secondary">
                            {selectedReconcilerForm.label} API key is stored for your profile.
                          </Typography>
                          <Button
                            size="small"
                            onClick={() => updateReconcilerForm(selectedReconcilerId, { showApiKeyInput: true })}
                          >
                            Update key
                          </Button>
                        </Box>
                      ) : (
                        <TextField
                          label={`${selectedReconcilerForm.label} API key${selectedReconcilerForm.requiresApiKey ? '' : ' (optional)'}`}
                          type="password"
                          fullWidth
                          value={selectedReconcilerForm.apiKey}
                          placeholder={selectedReconcilerForm.hasApiKey ? 'Stored in profile (leave blank to keep)' : 'Enter API key'}
                          onChange={(e) => updateReconcilerForm(selectedReconcilerId, { apiKey: e.target.value })}
                          helperText={selectedReconcilerForm.requiresApiKey
                            ? (selectedReconcilerForm.hasApiKey ? 'Key is stored for your profile.' : 'Key will be stored for your profile.')
                            : 'Optional key. Leave blank if the service does not require one.'}
                        />
                      )}
                    </Grid>
                    {(selectedReconcilerForm.fields || []).map((field) => {
                      const fieldKey = field?.key;
                      if (!fieldKey) return null;
                      const isSensitive = Boolean(field?.sensitive || field?.type === 'password');
                      if (isSensitive) {
                        const sensitiveState = selectedReconcilerForm.sensitiveFields?.[fieldKey] || {
                          hasValue: false,
                          showInput: true,
                          value: ''
                        };
                        return (
                          <Grid item xs={12} key={`${selectedReconcilerId}-${fieldKey}`}>
                            {!sensitiveState.showInput && sensitiveState.hasValue ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Typography variant="body2" color="text.secondary">
                                  {field.label} is stored for your profile.
                                </Typography>
                                <Button
                                  size="small"
                                  onClick={() => updateReconcilerForm(selectedReconcilerId, (current) => ({
                                    sensitiveFields: {
                                      ...(current?.sensitiveFields || {}),
                                      [fieldKey]: {
                                        ...(current?.sensitiveFields?.[fieldKey] || {}),
                                        showInput: true
                                      }
                                    }
                                  }))}
                                >
                                  Update
                                </Button>
                              </Box>
                            ) : (
                              <TextField
                                label={field.label}
                                type="password"
                                fullWidth
                                value={sensitiveState.value || ''}
                                placeholder={sensitiveState.hasValue ? 'Stored in profile (leave blank to keep)' : `Enter ${field.label}`}
                                onChange={(e) => updateReconcilerForm(selectedReconcilerId, (current) => ({
                                  sensitiveFields: {
                                    ...(current?.sensitiveFields || {}),
                                    [fieldKey]: {
                                      ...(current?.sensitiveFields?.[fieldKey] || {}),
                                      value: e.target.value
                                    }
                                  }
                                }))}
                                helperText={sensitiveState.hasValue
                                  ? 'Stored in profile. Leave blank to keep current value.'
                                  : 'Value will be stored for your profile.'}
                              />
                            )}
                          </Grid>
                        );
                      }

                      return (
                        <Grid item xs={12} md={field?.type === 'number' ? 4 : 12} key={`${selectedReconcilerId}-${fieldKey}`}>
                          <TextField
                            label={field.label}
                            type={field?.type === 'number' ? 'number' : 'text'}
                            fullWidth
                            value={selectedReconcilerForm.values?.[fieldKey] ?? ''}
                            inputProps={field?.type === 'number'
                              ? {
                                min: field?.min ?? 1,
                                max: field?.max ?? 100
                              }
                              : undefined}
                            placeholder={field?.placeholder || ''}
                            onChange={(e) => updateReconcilerForm(selectedReconcilerId, (current) => ({
                              values: {
                                ...(current?.values || {}),
                                [fieldKey]: field?.type === 'number'
                                  ? (e.target.value === '' ? '' : Number(e.target.value))
                                  : e.target.value
                              }
                            }))}
                          />
                        </Grid>
                      );
                    })}
                  </Grid>
                </CardContent>
              </Card>
            )}
          </Grid>
        </Grid>
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
