import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTableData,
  exportTableCsv,
  updateColumnClassification,
  requestColumnIdentification,
  getColumnIdentifyStatus,
  requestDpvAnnotation,
  getDpvStatus,
  getLlmSettings,
  updateLlmSettings,
  getReconciliationSettings,
  createReconciliationJob,
  getReconciliationStatus,
  triggerReconciliationColumnTypes,
  getReconciliationColumnTypes,
  getReconciliationCandidates,
  updateReconciliationCell
} from '../services/apiServices';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Chip,
  Card,
  CardHeader,
  CardContent,
  Button,
  Divider,
  Breadcrumbs,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  TextField,
  Checkbox,
  FormHelperText
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import BuildIcon from '@mui/icons-material/Build';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import PolicyIcon from '@mui/icons-material/Policy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TableHeader from './TableHeader';
import TableSearch from './TableSearch';
import TableSortControls from './TableSortControls';
import TypeFilterModal from './TypeFilterModal';
import { COLUMN_TYPES, LIT_TYPES, NER_TYPES } from '../constants/columnTypes';

const TruncatedCell = ({ content, maxLength = 100 }) => {
  if (!content) return null;
  const text = String(content);
  if (text.length <= maxLength) {
    return <span>{text}</span>;
  }
  return <span>{text.substring(0, maxLength)}...</span>;
};

const LIT_COARSE_MAP = {
  'xsd:integer': 'NUMBER',
  'xsd:decimal': 'NUMBER',
  'xsd:boolean': 'STRING',
  'xsd:string': 'STRING',
  'xsd:date': 'DATETIME',
  'xsd:datetime': 'DATETIME',
  'xsd:anyuri': 'STRING',
  'ext:email': 'STRING',
  'ext:ipv4': 'STRING',
  'ext:ipv6': 'STRING',
  'ext:phone': 'STRING',
  'ext:uuid': 'STRING',
  'ext:url': 'STRING',
  'ext:postalcode': 'STRING',
  'ext:countrycode': 'STRING',
  'ext:currencycode': 'STRING',
  'ext:lat': 'NUMBER',
  'ext:lon': 'NUMBER',
  'ext:percentage': 'NUMBER',
  'ext:duration': 'NUMBER'
};

const getLitCoarseType = (value) => {
  const raw = value ? String(value).trim() : '';
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (LIT_TYPES.includes(upper)) {
    return upper;
  }
  if (upper.startsWith('LIT:')) {
    const litValue = upper.slice(4);
    if (LIT_TYPES.includes(litValue)) {
      return litValue;
    }
  }
  const mapped = LIT_COARSE_MAP[raw.toLowerCase()];
  if (mapped) return mapped;
  const lower = raw.toLowerCase();
  if (lower.includes('date') || lower.includes('time')) {
    return 'DATETIME';
  }
  if (
    lower.includes('int') ||
    lower.includes('decimal') ||
    lower.includes('number') ||
    lower.includes('percent') ||
    lower.includes('duration') ||
    lower.includes('lat') ||
    lower.includes('lon')
  ) {
    return 'NUMBER';
  }
  return 'STRING';
};

const getSpecificSubtype = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.type_id || value.specific || value.type || value.subtype || value.value || '';
  }
  return String(value);
};

const getCoarseSubtype = (value) => {
  if (!value) return '';
  if (typeof value === 'object') {
    const coarse = value.coarse_type_id || value.coarse || value.coarse_type || '';
    return getLitCoarseType(coarse || value.type_id || value.specific || '');
  }
  return getLitCoarseType(value);
};

const buildClassificationState = (headers, classifiedColumns) => {
  const state = {};
  headers.forEach((_, idx) => {
    if (classifiedColumns?.NE?.hasOwnProperty(idx)) {
      const rawSubtype = getSpecificSubtype(classifiedColumns.NE[idx]);
      state[idx] = {
        type: 'NE',
        subtype: rawSubtype,
        rawSubtype,
        derivedSubtype: rawSubtype
      };
    } else if (classifiedColumns?.LIT?.hasOwnProperty(idx)) {
      const rawSubtype = getSpecificSubtype(classifiedColumns.LIT[idx]);
      const derivedSubtype = getCoarseSubtype(classifiedColumns.LIT[idx]);
      state[idx] = {
        type: 'LIT',
        subtype: derivedSubtype,
        rawSubtype,
        derivedSubtype
      };
    } else {
      state[idx] = {
        type: 'IGNORED',
        subtype: '',
        rawSubtype: '',
        derivedSubtype: ''
      };
    }
  });
  return state;
};

const buildColumnClassificationPayload = (classificationState = {}) => {
  const NE = {};
  const LIT = {};
  Object.entries(classificationState).forEach(([idx, entry]) => {
    const { type, subtype, rawSubtype, derivedSubtype } = entry || {};
    if (type === 'NE' && subtype) {
      NE[idx] = subtype;
    } else if (type === 'LIT' && subtype) {
      const keepRaw = rawSubtype && derivedSubtype && subtype === derivedSubtype;
      LIT[idx] = keepRaw ? rawSubtype : subtype;
    }
  });
  const payload = {};
  if (Object.keys(NE).length) payload.NE = NE;
  if (Object.keys(LIT).length) payload.LIT = LIT;
  return payload;
};

const TableDataViewer = () => {
  const navigate = useNavigate();
  const { datasetName, tableName } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [nextCursor, setNextCursor] = useState(null);
  const [prevCursor, setPrevCursor] = useState(null);
  const [reconcilePanelExpanded, setReconcilePanelExpanded] = useState(false);
  const [tableToolsExpanded, setTableToolsExpanded] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchColumns, setSearchColumns] = useState([]);
  const [activeFilters, setActiveFilters] = useState({
    includeTypes: [],
    excludeTypes: [],
    includeNeTypes: [],
    excludeNeTypes: [],
    reconciliationMinScore: '',
    reconciliationMaxScore: ''
  });
  const [reconciliationScoreDraft, setReconciliationScoreDraft] = useState({
    min: '',
    max: ''
  });
  const [sortParams, setSortParams] = useState({
    sortBy: null,
    sortDirection: 'desc'
  });
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [columnEditorOpen, setColumnEditorOpen] = useState(false);
  const [columnClassification, setColumnClassification] = useState({});
  const [columnEditorError, setColumnEditorError] = useState(null);
  const [autoDetectStatus, setAutoDetectStatus] = useState(null);
  const [autoIdentifyOpen, setAutoIdentifyOpen] = useState(false);
  const [autoIdentifySubmitting, setAutoIdentifySubmitting] = useState(false);
  const [autoIdentifyPolling, setAutoIdentifyPolling] = useState(false);
  const [dpvDetectStatus, setDpvDetectStatus] = useState(null);
  const [dpvIdentifyOpen, setDpvIdentifyOpen] = useState(false);
  const [dpvIdentifySubmitting, setDpvIdentifySubmitting] = useState(false);
  const [dpvIdentifyPolling, setDpvIdentifyPolling] = useState(false);
  const [autoIdentifyConfig, setAutoIdentifyConfig] = useState({
    provider: '',
    model: ''
  });
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmHasApiKey, setLlmHasApiKey] = useState(false);
  const [showLlmApiKeyInput, setShowLlmApiKeyInput] = useState(false);
  const [llmOptions, setLlmOptions] = useState({
    providers: [],
    endpoints: []
  });
  const [llmSettingsError, setLlmSettingsError] = useState(null);
  const [showDpvAnnotations, setShowDpvAnnotations] = useState(true);
  const [reconcileScope, setReconcileScope] = useState('cell');
  const [reconcileColumns, setReconcileColumns] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [reconcileTopK, setReconcileTopK] = useState(5);
  const [reconcileJobId, setReconcileJobId] = useState(null);
  const [reconcileStatus, setReconcileStatus] = useState(null);
  const [reconcileSubmitting, setReconcileSubmitting] = useState(false);
  const [reconcilePolling, setReconcilePolling] = useState(false);
  const [reconcileProvider, setReconcileProvider] = useState('lion_linker');
  const [reconcileSettings, setReconcileSettings] = useState({
    availableProviders: ['lion_linker'],
    lion: {
      hasApiKey: false,
      hasLlmApiKey: false,
      hasLamapiToken: false
    },
    crocodile: {
      hasApiKey: false
    }
  });
  const [reconcileColumnTypes, setReconcileColumnTypes] = useState(null);
  const [reconcileColumnTypesStatus, setReconcileColumnTypesStatus] = useState('UNSET');
  const [reconcileColumnTypesJobId, setReconcileColumnTypesJobId] = useState(null);
  const [reconcileColumnTypesConfig, setReconcileColumnTypesConfig] = useState(null);
  const [reconcileColumnTypesTriggering, setReconcileColumnTypesTriggering] = useState(false);
  const [reconcileColumnTypesError, setReconcileColumnTypesError] = useState(null);
  const [reconcileTypeSampleStrategy, setReconcileTypeSampleStrategy] = useState('auto');
  const [reconcileTypeSampleSize, setReconcileTypeSampleSize] = useState(5000);
  const [selectedNeColumn, setSelectedNeColumn] = useState(null);
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState(null);
  const [candidatePayload, setCandidatePayload] = useState(null);
  const [candidateCellMeta, setCandidateCellMeta] = useState(null);
  const [candidateSelection, setCandidateSelection] = useState(null);
  const [candidateSaving, setCandidateSaving] = useState(false);
  const [candidateSaveError, setCandidateSaveError] = useState(null);

  const fetchTableData = useCallback(async (options = {}) => {
    setLoading(true);
    try {
      const response = await getTableData(datasetName, tableName, 10, {
        ...options,
        search: searchText || undefined,
        searchColumns: searchColumns?.length > 0 ? searchColumns : undefined,
        includeTypes: activeFilters.includeTypes?.length > 0 ? activeFilters.includeTypes : undefined,
        excludeTypes: activeFilters.excludeTypes?.length > 0 ? activeFilters.excludeTypes : undefined,
        includeNeTypes: activeFilters.includeNeTypes?.length > 0 ? activeFilters.includeNeTypes : undefined,
        excludeNeTypes: activeFilters.excludeNeTypes?.length > 0 ? activeFilters.excludeNeTypes : undefined,
        reconciliationMinScore: activeFilters.reconciliationMinScore !== '' ? activeFilters.reconciliationMinScore : undefined,
        reconciliationMaxScore: activeFilters.reconciliationMaxScore !== '' ? activeFilters.reconciliationMaxScore : undefined,
        reconciliationProvider: reconcileProvider || undefined,
        sortBy: sortParams.sortBy || undefined,
        sortDirection: sortParams.sortDirection || undefined
      });
      if (response.data) {
        setData(response.data);
        setNextCursor(response.pagination?.next_cursor || null);
        setPrevCursor(response.pagination?.prev_cursor || null);
        setError(null);
      } else {
        setError('No data available');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  }, [datasetName, tableName, searchText, searchColumns, activeFilters, sortParams, reconcileProvider]);

  const fetchReconciliationColumnTypes = useCallback(async () => {
    try {
      const response = await getReconciliationColumnTypes(datasetName, tableName);
      setReconcileColumnTypes(response?.result || null);
      setReconcileColumnTypesStatus(response?.status || 'UNSET');
      setReconcileColumnTypesJobId(response?.job_id || null);
      setReconcileColumnTypesConfig(response?.config || null);
      if (response?.error?.detail || response?.error) {
        setReconcileColumnTypesError(response?.error?.detail || response?.error);
      } else {
        setReconcileColumnTypesError(null);
      }
    } catch (err) {
      setReconcileColumnTypesError(
        err?.response?.data?.detail || err?.message || 'Unable to load NE column type ranking.'
      );
      setReconcileColumnTypesStatus('FAILED');
    }
  }, [datasetName, tableName]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData]);

  useEffect(() => {
    fetchReconciliationColumnTypes();
  }, [fetchReconciliationColumnTypes]);

  useEffect(() => {
    if (data?.header) {
      setColumnClassification(buildClassificationState(data.header, data.classified_columns));
    }
  }, [data]);

  useEffect(() => {
    if (data?.header?.length) {
      setReconcileColumns(data.header.map((_, idx) => idx));
    }
  }, [data?.header]);

  useEffect(() => {
    setReconciliationScoreDraft({
      min: activeFilters.reconciliationMinScore === '' ? '' : String(activeFilters.reconciliationMinScore),
      max: activeFilters.reconciliationMaxScore === '' ? '' : String(activeFilters.reconciliationMaxScore)
    });
  }, [activeFilters.reconciliationMinScore, activeFilters.reconciliationMaxScore]);

  useEffect(() => {
    setSelectedRows(new Set());
    setSelectedCells(new Set());
  }, [data?.rows, reconcileScope]);

  useEffect(() => {
    if (data?.classification_status === 'AUTO_PENDING') {
      if (!autoIdentifyPolling) {
        setAutoIdentifyPolling(true);
      }
      if (!autoDetectStatus) {
        setAutoDetectStatus('Auto-identification in progress...');
      }
    }
  }, [data?.classification_status, autoIdentifyPolling, autoDetectStatus]);

  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      try {
        const [settings, reconSettings] = await Promise.all([
          getLlmSettings(),
          getReconciliationSettings()
        ]);
        if (!isMounted) return;
        const providers = settings?.allowed_providers || [];
        const configuredProvider = settings?.provider || '';
        const providerValid = !configuredProvider || providers.length === 0 || providers.includes(configuredProvider);
        setAutoIdentifyConfig({
          provider: providerValid ? configuredProvider : '',
          model: settings?.model || ''
        });
        const hasKey = Boolean(settings?.has_api_key);
        setLlmHasApiKey(hasKey);
        setShowLlmApiKeyInput(!hasKey);
        setLlmOptions({
          providers,
          endpoints: settings?.allowed_endpoints || []
        });
        setLlmSettingsError(
          providerValid ? null : 'Saved LLM provider is not supported by this server.'
        );
        const availableProviders = reconSettings?.available_providers || ['lion_linker'];
        const lionSettings = reconSettings?.lion_linker || {
          has_api_key: reconSettings?.has_api_key,
          has_llm_api_key: reconSettings?.has_llm_api_key,
          has_lamapi_token: reconSettings?.has_lamapi_token
        };
        const crocSettings = reconSettings?.crocodile || {
          has_api_key: reconSettings?.crocodile_has_api_key
        };
        setReconcileSettings({
          availableProviders,
          lion: {
            hasApiKey: Boolean(lionSettings?.has_api_key),
            hasLlmApiKey: Boolean(lionSettings?.has_llm_api_key),
            hasLamapiToken: Boolean(lionSettings?.has_lamapi_token)
          },
          crocodile: {
            hasApiKey: Boolean(crocSettings?.has_api_key)
          }
        });
        const defaultProvider = availableProviders.includes(reconSettings?.provider)
          ? reconSettings.provider
          : (availableProviders[0] || 'lion_linker');
        setReconcileProvider(defaultProvider);
      } catch (err) {
        const storedProvider = localStorage.getItem('koala.llmProvider') || '';
        const storedModel = localStorage.getItem('koala.llmModel') || '';
        if (!isMounted) return;
        setAutoIdentifyConfig({
          provider: storedProvider,
          model: storedModel
        });
        setLlmHasApiKey(false);
        setShowLlmApiKeyInput(true);
        setLlmSettingsError('Unable to load LLM settings from the profile.');
        setReconcileSettings({
          availableProviders: ['lion_linker'],
          lion: {
            hasApiKey: false,
            hasLlmApiKey: false,
            hasLamapiToken: false
          },
          crocodile: {
            hasApiKey: false
          }
        });
        setReconcileProvider('lion_linker');
      }
    };
    loadSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!autoIdentifyPolling) return;
    let cancelled = false;
    const pollStatus = async () => {
      try {
        const status = await getColumnIdentifyStatus(datasetName, tableName);
        if (cancelled) return;
        const resolved = status?.status;
        if (resolved === 'AUTO') {
          setAutoIdentifyPolling(false);
          setAutoDetectStatus('Auto-identification completed.');
          await fetchTableData();
          return;
        }
        if (resolved === 'AUTO_FAILED') {
          setAutoIdentifyPolling(false);
          setAutoDetectStatus('Auto-identification failed. Check your Moose/LLM settings.');
          await fetchTableData();
          return;
        }
      } catch (err) {
        if (!cancelled) {
          setAutoDetectStatus(err?.response?.data?.detail || 'Unable to check Moose job status.');
        }
      }
    };
    pollStatus();
    const timer = setInterval(pollStatus, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [autoIdentifyPolling, datasetName, tableName, fetchTableData]);

  useEffect(() => {
    if (data?.dpv_status === 'DPV_PENDING') {
      if (!dpvIdentifyPolling) {
        setDpvIdentifyPolling(true);
      }
      if (!dpvDetectStatus) {
        setDpvDetectStatus('DPV annotation in progress...');
      }
    }
  }, [data?.dpv_status, dpvIdentifyPolling, dpvDetectStatus]);

  useEffect(() => {
    if (!dpvIdentifyPolling) return;
    let cancelled = false;
    const pollStatus = async () => {
      try {
        const status = await getDpvStatus(datasetName, tableName);
        if (cancelled) return;
        const resolved = status?.status;
        if (resolved === 'DPV') {
          setDpvIdentifyPolling(false);
          setDpvDetectStatus('DPV annotation completed.');
          await fetchTableData();
          return;
        }
        if (resolved === 'DPV_FAILED') {
          setDpvIdentifyPolling(false);
          setDpvDetectStatus('DPV annotation failed. Check your Moose/LLM settings.');
          await fetchTableData();
        }
      } catch (err) {
        if (!cancelled) {
          setDpvDetectStatus(err?.response?.data?.detail || 'Unable to check DPV job status.');
        }
      }
    };
    pollStatus();
    const timer = setInterval(pollStatus, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [dpvIdentifyPolling, datasetName, tableName, fetchTableData]);

  const handlePreviousPage = () => {
    if (prevCursor) {
      fetchTableData({ prevCursor });
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (nextCursor) {
      fetchTableData({ nextCursor });
      setCurrentPage(prev => prev + 1);
    }
  };

  const handleSearch = (text, columns = []) => {
    setSearchText(text);
    setSearchColumns(columns);
    setCurrentPage(1);
  };

  const handleSortChange = (params) => {
    setSortParams(params);
    setCurrentPage(1);
  };

  const handleApplyFilter = (filterData) => {
    setActiveFilters(prev => ({
      ...prev,
      includeNeTypes: filterData.includeTypes || [],
      excludeNeTypes: filterData.excludeTypes || [],
      includeTypes: [],
      excludeTypes: []
    }));
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchText('');
    setSearchColumns([]);
    setActiveFilters({
      includeTypes: [],
      excludeTypes: [],
      includeNeTypes: [],
      excludeNeTypes: [],
      reconciliationMinScore: '',
      reconciliationMaxScore: ''
    });
    setReconciliationScoreDraft({ min: '', max: '' });
    setSortParams({
      sortBy: null,
      sortDirection: 'desc'
    });
    setCurrentPage(1);
  };

  const handleApplyReconciliationScoreFilter = () => {
    const minValue = reconciliationScoreDraft.min === '' ? '' : Number(reconciliationScoreDraft.min);
    const maxValue = reconciliationScoreDraft.max === '' ? '' : Number(reconciliationScoreDraft.max);
    if (minValue !== '' && Number.isNaN(minValue)) {
      setReconcileStatus('Minimum score must be a valid number.');
      return;
    }
    if (maxValue !== '' && Number.isNaN(maxValue)) {
      setReconcileStatus('Maximum score must be a valid number.');
      return;
    }
    if (minValue !== '' && maxValue !== '' && minValue > maxValue) {
      setReconcileStatus('Minimum score cannot be greater than maximum score.');
      return;
    }
    setActiveFilters(prev => ({
      ...prev,
      reconciliationMinScore: minValue === '' ? '' : Math.max(0, Math.min(1, minValue)),
      reconciliationMaxScore: maxValue === '' ? '' : Math.max(0, Math.min(1, maxValue))
    }));
    setCurrentPage(1);
  };

  const handleClearReconciliationScoreFilter = () => {
    setReconciliationScoreDraft({ min: '', max: '' });
    setActiveFilters(prev => ({
      ...prev,
      reconciliationMinScore: '',
      reconciliationMaxScore: ''
    }));
    setCurrentPage(1);
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      const res = await exportTableCsv(datasetName, tableName);
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `${datasetName}_${tableName}_export.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenColumnEditor = () => {
    setColumnEditorError(null);
    setColumnEditorOpen(true);
  };

  const handleSaveColumnEditor = async () => {
    try {
      setColumnEditorError(null);
      const payload = buildColumnClassificationPayload(columnClassification);
      await updateColumnClassification(datasetName, tableName, payload);
      setColumnEditorOpen(false);
      await fetchTableData();
    } catch (err) {
      setColumnEditorError(err?.response?.data?.detail || err?.message || 'Failed to update column types.');
    }
  };

  const handleAutoIdentifyColumns = () => {
    setAutoIdentifyOpen(true);
  };

  const handleOpenDpvAnnotation = () => {
    setDpvIdentifyOpen(true);
  };

  const persistLlmSettings = async () => {
    const llmProvider = autoIdentifyConfig.provider.trim();
    const llmModel = autoIdentifyConfig.model.trim();
    if (llmOptions.providers.length > 0 && llmProvider && !llmOptions.providers.includes(llmProvider)) {
      throw new Error('Selected LLM provider is not supported.');
    }
    await updateLlmSettings({
      provider: llmProvider || null,
      model: llmModel || null,
      api_key: showLlmApiKeyInput ? (llmApiKey.trim() || undefined) : undefined
    });
    localStorage.setItem('koala.llmProvider', llmProvider);
    localStorage.setItem('koala.llmModel', llmModel);
    if (showLlmApiKeyInput && llmApiKey.trim()) {
      setLlmHasApiKey(true);
      setLlmApiKey('');
      setShowLlmApiKeyInput(false);
    }
    return { llmProvider, llmModel };
  };

  const handleSubmitAutoIdentify = async () => {
    try {
      setAutoIdentifySubmitting(true);
      await persistLlmSettings();
      const response = await requestColumnIdentification(datasetName, tableName);
      const modelLabel = response?.llm_provider && response?.llm_model
        ? ` using ${response.llm_provider}:${response.llm_model}`
        : '';
      setAutoDetectStatus(
        response?.job_id
          ? `Auto-identification queued${modelLabel} (job ${response.job_id}).`
          : (response?.detail || `Auto-identification queued${modelLabel}.`)
      );
      setAutoIdentifyPolling(true);
      setAutoIdentifyOpen(false);
      await fetchTableData();
    } catch (err) {
      setAutoDetectStatus(err?.response?.data?.detail || err?.message || 'Failed to request auto identification.');
    } finally {
      setAutoIdentifySubmitting(false);
    }
  };

  const handleSubmitDpvAnnotation = async () => {
    try {
      setDpvIdentifySubmitting(true);
      await persistLlmSettings();
      const response = await requestDpvAnnotation(datasetName, tableName);
      const modelLabel = response?.llm_provider && response?.llm_model
        ? ` using ${response.llm_provider}:${response.llm_model}`
        : '';
      setDpvDetectStatus(
        response?.job_id
          ? `DPV annotation queued${modelLabel} (job ${response.job_id}).`
          : (response?.detail || `DPV annotation queued${modelLabel}.`)
      );
      setDpvIdentifyPolling(true);
      setDpvIdentifyOpen(false);
      await fetchTableData();
    } catch (err) {
      setDpvDetectStatus(err?.response?.data?.detail || err?.message || 'Failed to request DPV annotation.');
    } finally {
      setDpvIdentifySubmitting(false);
    }
  };

  const toggleRowSelection = (rowId) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const toggleCellSelection = (rowId, colIndex) => {
    const key = `${rowId}:${colIndex}`;
    setSelectedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleToggleAllRows = (checked) => {
    if (!data?.rows) return;
    setSelectedRows(new Set(checked ? data.rows.map(row => row.idRow) : []));
  };

  const buildReconcilePayload = () => {
    const payload = {
      provider: reconcileProvider,
      scope: reconcileScope,
      top_k: reconcileTopK || undefined
    };

    if (reconcileScope === 'cell') {
      const cells = Array.from(selectedCells).map((entry) => {
        const [row, col] = entry.split(':').map(Number);
        return { row, col };
      });
      payload.cells = cells;
    } else if (reconcileScope === 'rows') {
      payload.rows = Array.from(selectedRows);
      payload.columns = reconcileColumns;
    } else if (reconcileScope === 'page') {
      payload.rows = (data?.rows || []).map((row) => row.idRow);
      payload.columns = reconcileColumns;
    } else if (reconcileScope === 'table') {
      payload.columns = reconcileColumns;
    }
    return payload;
  };

  const handleReconcile = async () => {
    setReconcileStatus(null);
    if (reconcileProvider === 'lion_linker') {
      if (!reconcileSettings.lion.hasApiKey ||
        !reconcileSettings.lion.hasLlmApiKey ||
        !reconcileSettings.lion.hasLamapiToken) {
        setReconcileStatus('Missing Lion Linker or Lamapi credentials. Update your profile first.');
        return;
      }
    } else if (reconcileProvider === 'crocodile') {
      if (!reconcileSettings.crocodile.hasApiKey) {
        setReconcileStatus('Missing Crocodile API key. Update your profile first.');
        return;
      }
    }
    if (reconcileScope === 'cell' && selectedCells.size === 0) {
      setReconcileStatus('Select at least one cell to reconcile.');
      return;
    }
    if (reconcileScope === 'rows' && selectedRows.size === 0) {
      setReconcileStatus('Select at least one row to reconcile.');
      return;
    }
    if (reconcileScope !== 'cell' && reconcileColumns.length === 0) {
      setReconcileStatus('Select at least one column to reconcile.');
      return;
    }
    setReconcileSubmitting(true);
    try {
      const payload = buildReconcilePayload();
      const response = await createReconciliationJob(datasetName, tableName, payload);
      setReconcileJobId(response?.job_id || null);
      setReconcileStatus(response?.detail || 'Reconciliation job queued.');
      setReconcilePolling(true);
    } catch (err) {
      setReconcileStatus(err?.response?.data?.detail || err?.message || 'Failed to start reconciliation.');
    } finally {
      setReconcileSubmitting(false);
    }
  };

  const handleTriggerColumnTypeRanking = async () => {
    try {
      setReconcileColumnTypesTriggering(true);
      const response = await triggerReconciliationColumnTypes(datasetName, tableName, {
        provider: null,
        sample_strategy: reconcileTypeSampleStrategy,
        sample_size: reconcileTypeSampleSize,
        max_types: 10
      });
      setReconcileColumnTypesStatus(response?.status || 'PENDING');
      setReconcileColumnTypesJobId(response?.job_id || null);
      setReconcileColumnTypesConfig(response?.config || null);
      setReconcileColumnTypesError(null);
    } catch (err) {
      setReconcileColumnTypesError(
        err?.response?.data?.detail || err?.message || 'Unable to start NE column type ranking job.'
      );
    } finally {
      setReconcileColumnTypesTriggering(false);
    }
  };

  useEffect(() => {
    if (!reconcilePolling || !reconcileJobId) return;
    let cancelled = false;
    const successStatuses = ['completed', 'succeeded', 'success', 'done', 'finished'];
    const failureStatuses = ['failed', 'error', 'canceled', 'cancelled', 'sync_failed', 'timeout'];
    const pollStatus = async () => {
      try {
        const status = await getReconciliationStatus(datasetName, tableName, reconcileJobId);
        if (cancelled) return;
        const resolved = status?.status || 'queued';
        if (successStatuses.includes(resolved) && status?.synced) {
          setReconcilePolling(false);
          setReconcileStatus('Reconciliation completed.');
          setReconcileJobId(null);
          await fetchTableData();
          await fetchReconciliationColumnTypes();
          return;
        }
        if (failureStatuses.includes(resolved)) {
          setReconcilePolling(false);
          const detail = status?.error?.detail || status?.error || 'Reconciliation failed.';
          setReconcileStatus(detail);
          setReconcileJobId(null);
          return;
        }
        setReconcileStatus(`Reconciliation ${resolved}...`);
      } catch (err) {
        if (!cancelled) {
          setReconcileStatus(err?.response?.data?.detail || 'Unable to check reconciliation status.');
        }
      }
    };
    pollStatus();
    const timer = setInterval(pollStatus, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [reconcilePolling, reconcileJobId, datasetName, tableName, fetchTableData, fetchReconciliationColumnTypes]);

  useEffect(() => {
    if (!['PENDING', 'RUNNING'].includes(reconcileColumnTypesStatus)) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      await fetchReconciliationColumnTypes();
    };
    const timer = setInterval(poll, 3000);
    poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [reconcileColumnTypesStatus, fetchReconciliationColumnTypes]);

  const availableTypes = useMemo(() => {
    return data?.reconciliation?.type_summary || [];
  }, [data]);

  const reconciliationCells = useMemo(() => {
    return data?.reconciliation?.cells || {};
  }, [data?.reconciliation]);

  const reconciliationScoreRange = useMemo(() => {
    return data?.reconciliation?.score_range || { min: null, max: null };
  }, [data?.reconciliation]);

  const columnDpvAnnotations = useMemo(() => {
    const annotations = data?.dpv_annotations || {};
    return (data?.header || []).map((_, idx) => {
      const entry = annotations[idx] || annotations[String(idx)];
      if (!entry) return null;
      const typeId = entry.type_id || entry.typeId || entry.type || '';
      if (!typeId) return null;
      return {
        typeId,
        confidence: entry.confidence
      };
    });
  }, [data?.dpv_annotations, data?.header]);

  const hasDpvAnnotations = columnDpvAnnotations.some(Boolean);

  const reconciliationColumnTypeColumns = useMemo(() => {
    return reconcileColumnTypes?.columns || {};
  }, [reconcileColumnTypes]);

  const reconciliationColumnTypeTopByIndex = useMemo(() => {
    const map = {};
    Object.entries(reconciliationColumnTypeColumns).forEach(([idx, payload]) => {
      if (payload?.top_type) {
        map[Number(idx)] = payload.top_type;
      }
    });
    return map;
  }, [reconciliationColumnTypeColumns]);

  const selectedNeColumnSummary = useMemo(() => {
    if (selectedNeColumn === null || selectedNeColumn === undefined) return null;
    return reconciliationColumnTypeColumns?.[selectedNeColumn] ||
      reconciliationColumnTypeColumns?.[String(selectedNeColumn)] ||
      null;
  }, [selectedNeColumn, reconciliationColumnTypeColumns]);

  const getReconciliationEntry = (rowId, colIndex) => {
    const rowEntry = reconciliationCells?.[rowId] || reconciliationCells?.[String(rowId)];
    if (!rowEntry) return null;
    return rowEntry[colIndex] || rowEntry[String(colIndex)] || null;
  };

  const openCandidates = async (event, rowId, colIndex, cellValue, providerOverride) => {
    event.stopPropagation();
    setCandidateDialogOpen(true);
    setCandidateLoading(true);
    setCandidateError(null);
    setCandidatePayload(null);
    setCandidateSaveError(null);
    setCandidateSelection(null);
    const provider = providerOverride || reconcileProvider;
    setCandidateCellMeta({
      rowId,
      colIndex,
      value: cellValue,
      provider
    });
    try {
      const response = await getReconciliationCandidates(datasetName, tableName, rowId, colIndex, provider);
      setCandidatePayload(response?.payload || null);
      const current = getReconciliationEntry(rowId, colIndex)?.final;
      if (current?.id || current?.name) {
        setCandidateSelection({
          id: current.id || null,
          name: current.name || null
        });
      }
    } catch (err) {
      setCandidateError(err?.response?.data?.detail || err?.message || 'Failed to load candidates.');
    } finally {
      setCandidateLoading(false);
    }
  };

  const handleCandidateSelect = (candidate) => {
    setCandidateSelection({
      id: candidate?.id || candidate?.entity_id || null,
      name: candidate?.name || candidate?.label || null,
      candidate
    });
  };

  const handleCandidateSave = async () => {
    if (!candidateCellMeta) return;
    if (!candidateSelection?.candidate) {
      setCandidateSaveError('Select a candidate first.');
      return;
    }
    setCandidateSaving(true);
    setCandidateSaveError(null);
    const selected = candidateSelection?.candidate;
    const finalPayload = {
      id: selected?.id || selected?.entity_id || null,
      name: selected?.name || selected?.label || null,
      types: selected?.types || selected?.metadata?.types || null,
      description: selected?.description || selected?.metadata?.description || null,
      confidence_label: selected?.confidence_label || null,
      confidence_score: selected?.confidence_score ?? selected?.score ?? null,
      label: selected?.label || null
    };
    try {
      await updateReconciliationCell(datasetName, tableName, {
        row: candidateCellMeta.rowId,
        col: candidateCellMeta.colIndex,
        provider: candidateCellMeta.provider,
        final: finalPayload
      });
      await fetchTableData();
      await fetchReconciliationColumnTypes();
      setCandidateDialogOpen(false);
    } catch (err) {
      setCandidateSaveError(err?.response?.data?.detail || err?.message || 'Failed to save selection.');
    } finally {
      setCandidateSaving(false);
    }
  };

  const handleCandidateClear = async () => {
    if (!candidateCellMeta) return;
    setCandidateSaving(true);
    setCandidateSaveError(null);
    try {
      await updateReconciliationCell(datasetName, tableName, {
        row: candidateCellMeta.rowId,
        col: candidateCellMeta.colIndex,
        provider: candidateCellMeta.provider,
        final: {}
      });
      await fetchTableData();
      await fetchReconciliationColumnTypes();
      setCandidateDialogOpen(false);
    } catch (err) {
      setCandidateSaveError(err?.response?.data?.detail || err?.message || 'Failed to clear selection.');
    } finally {
      setCandidateSaving(false);
    }
  };

  const buildSubtypeOptions = (type, currentValue) => {
    const options = type === 'NE' ? NER_TYPES : type === 'LIT' ? LIT_TYPES : [];
    if (type === 'NE' && currentValue && !options.includes(currentValue)) {
      return [currentValue, ...options];
    }
    return options;
  };

  const renderLlmSettingsFields = () => (
    <>
      {llmSettingsError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {llmSettingsError}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          {llmOptions.providers.length > 0 ? (
            <FormControl fullWidth>
              <InputLabel>LLM provider</InputLabel>
              <Select
                label="LLM provider"
                value={autoIdentifyConfig.provider}
                onChange={(e) => setAutoIdentifyConfig(prev => ({
                  ...prev,
                  provider: e.target.value
                }))}
              >
                <MenuItem value="">
                  Server default
                </MenuItem>
                {llmOptions.providers.map((provider) => (
                  <MenuItem key={provider} value={provider}>{provider}</MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <TextField
              label="LLM provider"
              fullWidth
              value={autoIdentifyConfig.provider}
              placeholder="openrouter or ollama"
              onChange={(e) => setAutoIdentifyConfig(prev => ({
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
            value={autoIdentifyConfig.model}
            placeholder="e.g. gpt-4o-mini"
            onChange={(e) => setAutoIdentifyConfig(prev => ({
              ...prev,
              model: e.target.value
            }))}
            helperText="Leave blank to use the server default."
          />
        </Grid>
        <Grid item xs={12}>
          {!showLlmApiKeyInput && llmHasApiKey ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                LLM API key is stored for your profile.
              </Typography>
              <Button size="small" onClick={() => setShowLlmApiKeyInput(true)}>
                Update key
              </Button>
            </Box>
          ) : (
            <TextField
              label="LLM API key"
              type="password"
              fullWidth
              value={llmApiKey}
              placeholder={llmHasApiKey ? 'Stored in profile (leave blank to keep)' : 'Enter API key'}
              onChange={(e) => setLlmApiKey(e.target.value)}
              helperText={llmHasApiKey ? 'Key is stored for your profile.' : 'Key will be stored for your profile.'}
            />
          )}
        </Grid>
      </Grid>
    </>
  );

  const hasActiveFilters = searchText ||
    searchColumns?.length > 0 ||
    activeFilters.includeTypes?.length > 0 ||
    activeFilters.excludeTypes?.length > 0 ||
    activeFilters.includeNeTypes?.length > 0 ||
    activeFilters.excludeNeTypes?.length > 0 ||
    activeFilters.reconciliationMinScore !== '' ||
    activeFilters.reconciliationMaxScore !== '' ||
    sortParams.sortBy;

  if (loading && !data) {
    return <CircularProgress />;
  }

  if (error) {
    return (
      <Alert
        severity="error"
        sx={{ m: 2 }}
        action={
          <Button color="inherit" size="small" onClick={fetchTableData}>
            Retry
          </Button>
        }
      >
        Error loading table data: {error}
      </Alert>
    );
  }

  if (!data || !data.rows || data.rows.length === 0) {
    return (
      <Card sx={{ m: 2, textAlign: 'center', p: 4 }}>
        <Typography variant="h6" color="text.secondary">
          No data available for this table
        </Typography>
        <Button
          variant="outlined"
          sx={{ mt: 2 }}
          onClick={fetchTableData}
        >
          Refresh
        </Button>
      </Card>
    );
  }

  const candidateList = candidatePayload?.candidate_ranking || candidatePayload?.candidates || [];
  const hasCandidateMatch = candidateList.some((candidate) => candidate.match === true);
  const candidateProvider = candidatePayload?.provider ||
    candidateCellMeta?.provider ||
    reconcileProvider;
  const isNilCandidateSet = candidateProvider === 'lion_linker' && candidateList.length > 0 && !hasCandidateMatch;

  const classified = data.classified_columns || { NE: {}, LIT: {} };
  const columnTypes = data.header.map((_, idx) =>
    classified?.NE?.hasOwnProperty(idx) ? 'NE'
      : classified?.LIT?.hasOwnProperty(idx) ? 'LIT'
        : ''
  );
  const columnSubtypes = data.header.map((_, idx) =>
    classified?.NE?.hasOwnProperty(idx)
      ? getSpecificSubtype(classified.NE[idx])
      : classified?.LIT?.hasOwnProperty(idx)
        ? getCoarseSubtype(classified.LIT[idx])
        : ''
  );
  const columnSpecificSubtypes = data.header.map((_, idx) =>
    classified?.LIT?.hasOwnProperty(idx)
      ? getSpecificSubtype(classified.LIT[idx])
      : ''
  );
  const classificationStatus = data?.classification_status || 'UNSET';
  const classificationLabel = classificationStatus === 'AUTO_PENDING'
    ? 'Auto-identifying...'
    : classificationStatus === 'AUTO'
      ? 'Auto (Moose)'
      : classificationStatus === 'AUTO_FAILED'
        ? 'Auto failed'
        : classificationStatus;
  const classificationColor = classificationStatus === 'AUTO'
    ? 'success'
    : classificationStatus === 'AUTO_PENDING'
      ? 'info'
      : classificationStatus === 'AUTO_FAILED'
        ? 'error'
        : classificationStatus === 'MANUAL'
          ? 'primary'
          : 'default';
  const autoDetectSeverity = classificationStatus === 'AUTO_FAILED'
    ? 'error'
    : classificationStatus === 'AUTO'
      ? 'success'
      : 'info';
  const dpvStatus = data?.dpv_status || 'UNSET';
  const dpvLabel = dpvStatus === 'DPV_PENDING'
    ? 'DPV: annotating...'
    : dpvStatus === 'DPV'
      ? 'DPV annotated'
      : dpvStatus === 'DPV_FAILED'
        ? 'DPV failed'
        : '';
  const dpvColor = dpvStatus === 'DPV'
    ? 'success'
    : dpvStatus === 'DPV_PENDING'
      ? 'info'
      : dpvStatus === 'DPV_FAILED'
        ? 'error'
        : 'default';
  const dpvDetectSeverity = dpvStatus === 'DPV_FAILED'
    ? 'error'
    : dpvStatus === 'DPV'
      ? 'success'
      : 'info';
  const reconcileSeverity = reconcilePolling
    ? 'info'
    : reconcileStatus && reconcileStatus.toLowerCase().includes('fail')
      ? 'error'
      : reconcileStatus && reconcileStatus.toLowerCase().includes('missing')
        ? 'error'
        : 'success';
  const columnTypeStatus = reconcileColumnTypesStatus || 'UNSET';
  const columnTypeStatusColor = ['READY'].includes(columnTypeStatus)
    ? 'success'
    : ['FAILED'].includes(columnTypeStatus)
      ? 'error'
      : ['PENDING', 'RUNNING'].includes(columnTypeStatus)
        ? 'info'
        : ['STALE'].includes(columnTypeStatus)
          ? 'warning'
          : 'default';
  const columnTypeSampling = reconcileColumnTypes?.sampling || null;
  const reconcileProviderLabel = reconcileProvider === 'crocodile' ? 'Crocodile' : 'Lion Linker';
  const missingReconcileCredentials = reconcileProvider === 'crocodile'
    ? !reconcileSettings.crocodile.hasApiKey
    : (!reconcileSettings.lion.hasApiKey ||
      !reconcileSettings.lion.hasLlmApiKey ||
      !reconcileSettings.lion.hasLamapiToken);

  const showRowSelection = reconcileScope === 'rows';
  const showRowIndex = reconcileScope === 'rows' || reconcileScope === 'cell';
  const selectedRowCount = selectedRows.size;
  const selectedCellCount = selectedCells.size;
  const allRowsSelected = data?.rows?.length > 0 && selectedRowCount === data.rows.length;
  const someRowsSelected = selectedRowCount > 0 && selectedRowCount < (data?.rows?.length || 0);
  const showDpvStatusChip = dpvStatus !== 'UNSET' || hasDpvAnnotations;
  const reconcileSelectionSummary = reconcileScope === 'cell'
    ? `Cell mode: ${selectedCellCount} selected.`
    : reconcileScope === 'rows'
      ? `Row mode: ${selectedRowCount} selected.`
      : reconcileScope === 'page'
        ? `Page mode: ${(data?.rows?.length || 0)} rows in scope.`
        : `Table mode: ${(data?.total_rows || 0)} rows in scope.`;
  const compactActionButtonSx = {
    py: 0,
    px: 0.9,
    minHeight: 26,
    fontSize: '0.74rem',
    textTransform: 'none'
  };
  const compactPanelButtonSx = {
    py: 0,
    px: 1,
    minHeight: 28,
    fontSize: '0.76rem',
    textTransform: 'none'
  };
  const compactIconButtonSx = {
    minWidth: 30,
    width: 30,
    height: 30,
    p: 0
  };

  return (
    <Box sx={{ m: 2 }}>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <Button
          color="inherit"
          onClick={() => navigate('/dataset')}
          sx={{
            cursor: 'pointer',
            textTransform: 'none',
            padding: 0,
            minWidth: 0,
            fontSize: 'inherit',
            fontWeight: 'inherit',
            color: 'inherit',
            textDecoration: 'underline',
            '&:hover': { textDecoration: 'underline' }
          }}
        >
          Datasets
        </Button>
        <Link
          color="inherit"
          onClick={() => navigate(`/dataset/${encodeURIComponent(datasetName)}`)}
          sx={{ cursor: 'pointer' }}
        >
          {datasetName}
        </Link>
        <Typography color="text.primary" noWrap>
          {tableName}
        </Typography>
      </Breadcrumbs>

      <Card elevation={3}>
        <CardHeader
          sx={{
            alignItems: 'flex-start',
            '& .MuiCardHeader-action': {
              alignSelf: 'center',
              mt: 0,
              mr: 0,
              overflow: 'hidden'
            }
          }}
          title={
            <Typography variant="h5" component="div">
              {tableName}
            </Typography>
          }
          subheader={
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', mt: 1, gap: 1 }}>
              <Typography variant="subtitle1" color="text.secondary" component="div">
                Dataset: {datasetName}
              </Typography>
              <Chip
                label={data?.status || 'READY'}
                size="small"
                color="success"
              />
              <Chip
                label={`Column types: ${classificationLabel}`}
                size="small"
                color={classificationColor}
                variant="outlined"
              />
              {showDpvStatusChip && (
                <Chip
                  label={dpvLabel || 'DPV'}
                  size="small"
                  color={dpvColor}
                  variant="outlined"
                />
              )}
              {data?.score_column_name && (
                <Chip
                  label={`Score: ${data.score_column_name}`}
                  size="small"
                  color="secondary"
                  variant="outlined"
                />
              )}
            </Box>
          }
          action={
            <Box
              sx={{
                display: 'inline-flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                alignItems: 'center',
                gap: 0.5,
                whiteSpace: 'nowrap',
                overflowX: 'auto',
                maxWidth: '100%',
                '& .MuiButton-root': {
                  width: 'auto',
                  flex: '0 0 auto'
                }
              }}
            >
              <Button
                variant="outlined"
                size="small"
                startIcon={<BuildIcon fontSize="small" />}
                onClick={handleOpenColumnEditor}
                sx={compactActionButtonSx}
              >
                Edit columns
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AutoFixHighIcon fontSize="small" />}
                onClick={handleAutoIdentifyColumns}
                disabled={loading || classificationStatus === 'AUTO_PENDING'}
                sx={compactActionButtonSx}
              >
                {classificationStatus === 'AUTO_PENDING' ? 'Auto-identifying...' : 'Auto identify'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<PolicyIcon fontSize="small" />}
                onClick={handleOpenDpvAnnotation}
                disabled={loading || dpvStatus === 'DPV_PENDING'}
                sx={compactActionButtonSx}
              >
                {dpvStatus === 'DPV_PENDING' ? 'Annotating DPV...' : 'Annotate DPV'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FileDownloadIcon fontSize="small" />}
                onClick={handleExport}
                sx={compactActionButtonSx}
              >
                Export CSV
              </Button>
            </Box>
          }
        />

        {autoDetectStatus && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Alert severity={autoDetectSeverity} onClose={() => setAutoDetectStatus(null)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {classificationStatus === 'AUTO_PENDING' && (
                  <CircularProgress size={16} />
                )}
                <span>{autoDetectStatus}</span>
              </Box>
            </Alert>
          </Box>
        )}

        {dpvDetectStatus && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Alert severity={dpvDetectSeverity} onClose={() => setDpvDetectStatus(null)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {dpvStatus === 'DPV_PENDING' && (
                  <CircularProgress size={16} />
                )}
                <span>{dpvDetectStatus}</span>
              </Box>
            </Alert>
          </Box>
        )}

        {reconcileStatus && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Alert severity={reconcileSeverity} onClose={() => setReconcileStatus(null)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {reconcilePolling && (
                  <CircularProgress size={16} />
                )}
                <span>{reconcileStatus}</span>
              </Box>
            </Alert>
          </Box>
        )}

        <CardContent sx={{ px: 2, py: 1 }}>
          <Accordion
            disableGutters
            elevation={0}
            expanded={reconcilePanelExpanded}
            onChange={(_, expanded) => setReconcilePanelExpanded(expanded)}
            sx={{
              border: '1px solid #d9e2f0',
              borderRadius: '8px',
              bgcolor: '#fbfdff',
              '&:before': { display: 'none' }
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ minHeight: 40, px: 1.25 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  color="primary"
                  variant="outlined"
                  label={`Linking · ${reconcileProviderLabel}`}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Scope: ${reconcileScope}`}
                />
                <Typography variant="caption" color="text.secondary">
                  {reconcileSelectionSummary}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Chip size="small" color={columnTypeStatusColor} label={`NE rank: ${columnTypeStatus}`} />
                <Tooltip title="Run reconciliation" arrow>
                  <span>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleReconcile();
                      }}
                      onFocus={(event) => event.stopPropagation()}
                      disabled={reconcileSubmitting || loading}
                      sx={compactIconButtonSx}
                    >
                      {reconcileSubmitting ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon fontSize="small" />}
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 1.25, py: 1 }}>
              {missingReconcileCredentials && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  {reconcileProvider === 'crocodile'
                    ? 'Crocodile API key is missing. Update your profile to run reconciliation.'
                    : 'Lion Linker or Lamapi credentials are missing. Update your profile to run reconciliation.'}
                </Alert>
              )}

              <Grid container spacing={1}>
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Provider</InputLabel>
                    <Select
                      label="Provider"
                      value={reconcileProvider}
                      onChange={(e) => setReconcileProvider(e.target.value)}
                    >
                      {(reconcileSettings.availableProviders || ['lion_linker']).map((provider) => (
                        <MenuItem key={provider} value={provider}>
                          {provider === 'crocodile' ? 'Crocodile' : 'Lion Linker'}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Scope</InputLabel>
                    <Select
                      label="Scope"
                      value={reconcileScope}
                      onChange={(e) => setReconcileScope(e.target.value)}
                    >
                      <MenuItem value="cell">Selected cells</MenuItem>
                      <MenuItem value="rows">Selected rows</MenuItem>
                      <MenuItem value="page">Current page</MenuItem>
                      <MenuItem value="table">Whole table</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small" disabled={reconcileScope === 'cell'}>
                    <InputLabel>Columns</InputLabel>
                    <Select
                      label="Columns"
                      multiple
                      value={reconcileColumns}
                      onChange={(event) => {
                        const value = event.target.value;
                        const parsed = (Array.isArray(value) ? value : [value]).map((entry) => Number(entry));
                        setReconcileColumns(parsed);
                      }}
                      renderValue={(selected) => {
                        if (!selected?.length) return 'No columns';
                        if (selected.length === (data?.header || []).length) return 'All columns';
                        return `${selected.length} columns`;
                      }}
                    >
                      {(data?.header || []).map((header, idx) => (
                        <MenuItem key={`${header}-${idx}`} value={idx}>
                          <Checkbox checked={reconcileColumns.includes(idx)} />
                          <Typography variant="body2">{header}</Typography>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    label="Top K"
                    type="number"
                    size="small"
                    fullWidth
                    value={reconcileTopK}
                    inputProps={{ min: 1, max: 100 }}
                    onChange={(e) => setReconcileTopK(Number(e.target.value) || 1)}
                  />
                </Grid>
              </Grid>

              <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                <FormHelperText sx={{ m: 0 }}>
                  {reconcileScope === 'cell'
                    ? 'Columns are derived from selected cells.'
                    : 'Link columns must be NE columns; Koala maps row/column indexes back automatically.'}
                </FormHelperText>
                {(reconcileScope === 'cell' || reconcileScope === 'rows') && (
                  <Button
                    size="small"
                    onClick={() => {
                      setSelectedRows(new Set());
                      setSelectedCells(new Set());
                    }}
                    sx={compactPanelButtonSx}
                  >
                    Clear selection
                  </Button>
                )}
              </Box>

              <Divider sx={{ my: 1 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2">NE type ranking</Typography>
                {columnTypeSampling?.sampled_cells !== undefined && (
                  <Typography variant="caption" color="text.secondary">
                    {columnTypeSampling.sampled_cells}/{columnTypeSampling.total_cells} cells ({columnTypeSampling.strategy})
                  </Typography>
                )}
                {!columnTypeSampling?.sampled_cells && reconcileColumnTypesConfig?.sample_strategy && (
                  <Typography variant="caption" color="text.secondary">
                    {reconcileColumnTypesConfig.sample_strategy} sampling
                  </Typography>
                )}
                {reconcileColumnTypesJobId && (
                  <Typography variant="caption" color="text.secondary">
                    job {reconcileColumnTypesJobId.slice(0, 8)}
                  </Typography>
                )}
                <Box sx={{ flex: 1 }} />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Sampling</InputLabel>
                  <Select
                    label="Sampling"
                    value={reconcileTypeSampleStrategy}
                    onChange={(event) => setReconcileTypeSampleStrategy(event.target.value)}
                    disabled={reconcileColumnTypesTriggering || ['PENDING', 'RUNNING'].includes(columnTypeStatus)}
                  >
                    <MenuItem value="auto">Auto</MenuItem>
                    <MenuItem value="latest">Latest</MenuItem>
                    <MenuItem value="random">Random</MenuItem>
                    <MenuItem value="all">All</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  type="number"
                  label="Sample"
                  value={reconcileTypeSampleSize}
                  inputProps={{ min: 1, max: 50000 }}
                  onChange={(event) => setReconcileTypeSampleSize(Math.max(1, Number(event.target.value) || 1))}
                  sx={{ width: 96 }}
                  disabled={reconcileTypeSampleStrategy === 'all' || reconcileColumnTypesTriggering || ['PENDING', 'RUNNING'].includes(columnTypeStatus)}
                />
                <Tooltip title="Compute NE type ranking" arrow>
                  <span>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleTriggerColumnTypeRanking}
                      disabled={reconcileColumnTypesTriggering || ['PENDING', 'RUNNING'].includes(columnTypeStatus)}
                      sx={compactIconButtonSx}
                    >
                      {reconcileColumnTypesTriggering || ['PENDING', 'RUNNING'].includes(columnTypeStatus)
                        ? <CircularProgress size={14} />
                        : <AutoGraphIcon fontSize="small" />}
                    </Button>
                  </span>
                </Tooltip>
              </Box>

              {reconcileColumnTypesError && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {reconcileColumnTypesError}
                </Alert>
              )}
              {!reconcileColumnTypesError && columnTypeStatus === 'UNSET' && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  No ranking computed yet. Click any NE header after running compute.
                </Typography>
              )}
            </AccordionDetails>
          </Accordion>
        </CardContent>

        <Divider />

        <CardContent sx={{ p: 2 }}>
          <TableSearch
            headers={data?.header || []}
            onSearch={handleSearch}
            loading={loading}
            columnTypes={columnTypes}
            initialSearchText={searchText}
            initialSearchColumns={searchColumns}
          />

          <Accordion
            disableGutters
            elevation={0}
            expanded={tableToolsExpanded}
            onChange={(_, expanded) => setTableToolsExpanded(expanded)}
            sx={{
              border: '1px solid #e4e8ef',
              borderRadius: '8px',
              '&:before': { display: 'none' },
              mb: 1
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ minHeight: 36, px: 1.25 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography variant="subtitle2">Table tools</Typography>
                {hasActiveFilters && (
                  <Chip label="Filters active" size="small" color="secondary" variant="outlined" />
                )}
                <Box sx={{ flex: 1 }} />
                <Typography variant="caption" color="text.secondary">
                  Sort, semantic filters, DPV display
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 1.5, py: 1 }}>
              <TableSortControls
                scoreColumnName={data?.score_column_name}
                onSort={handleSortChange}
                currentSortParams={sortParams}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={handleClearFilters}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                <TextField
                  size="small"
                  type="number"
                  label="Min link score"
                  value={reconciliationScoreDraft.min}
                  inputProps={{ min: 0, max: 1, step: 0.01 }}
                  onChange={(event) => setReconciliationScoreDraft(prev => ({
                    ...prev,
                    min: event.target.value
                  }))}
                  sx={{ width: 132 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Max link score"
                  value={reconciliationScoreDraft.max}
                  inputProps={{ min: 0, max: 1, step: 0.01 }}
                  onChange={(event) => setReconciliationScoreDraft(prev => ({
                    ...prev,
                    max: event.target.value
                  }))}
                  sx={{ width: 132 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleApplyReconciliationScoreFilter}
                  sx={compactPanelButtonSx}
                >
                  Apply score
                </Button>
                <Button
                  size="small"
                  onClick={handleClearReconciliationScoreFilter}
                  sx={compactPanelButtonSx}
                  disabled={activeFilters.reconciliationMinScore === '' && activeFilters.reconciliationMaxScore === ''}
                >
                  Clear score
                </Button>
                {(reconciliationScoreRange?.min !== null || reconciliationScoreRange?.max !== null) && (
                  <Typography variant="caption" color="text.secondary">
                    Available score range: {reconciliationScoreRange?.min ?? '-'} to {reconciliationScoreRange?.max ?? '-'}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setTypeFilterOpen(true)}
                  disabled={availableTypes.length === 0}
                  sx={compactPanelButtonSx}
                >
                  Filter linked NE types
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setShowDpvAnnotations(prev => !prev)}
                  disabled={!hasDpvAnnotations}
                  sx={compactPanelButtonSx}
                >
                  {showDpvAnnotations ? 'Hide DPV' : 'Show DPV'}
                </Button>
                {availableTypes.length === 0 && (
                  <Tooltip title="No linked NE types available for filtering.">
                    <Typography variant="caption" color="text.secondary">
                      No types available
                    </Typography>
                  </Tooltip>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        </CardContent>

        <Divider />

        <CardContent sx={{ p: 0 }}>
          <Dialog
            open={selectedNeColumn !== null}
            onClose={() => setSelectedNeColumn(null)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>
              NE Column Ranking
            </DialogTitle>
            <DialogContent dividers>
              {selectedNeColumn !== null && (
                <Box>
                  <Typography variant="subtitle2">
                    Col {selectedNeColumn}: {data?.header?.[selectedNeColumn] || 'Unknown'}
                  </Typography>
                  {!selectedNeColumnSummary ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      No computed evidence for this column. Run "Compute ranking" first.
                    </Typography>
                  ) : (
                    <>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        Evidence cells: {selectedNeColumnSummary.evidence_cells}
                      </Typography>
                      <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {(selectedNeColumnSummary.ranking || []).slice(0, 10).map((entry, idx) => (
                          <Paper
                            key={`ne-rank-${selectedNeColumn}-${entry.id || entry.name || idx}`}
                            variant="outlined"
                            sx={{ p: 1, bgcolor: idx === 0 ? '#eef5ff' : 'transparent', borderColor: idx === 0 ? '#9fc0eb' : undefined }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: idx === 0 ? 700 : 500 }}>
                                #{idx + 1} {entry.name || entry.id}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {entry.frequency !== undefined
                                  ? `${Math.round(entry.frequency * 100)}% freq`
                                  : entry.probability !== undefined
                                    ? `${Math.round(entry.probability * 100)}%`
                                    : ''}
                              </Typography>
                            </Box>
                            {entry.probability !== undefined && (
                              <Typography variant="caption" color="text.secondary">
                                Weighted share: {Math.round(entry.probability * 100)}%
                              </Typography>
                            )}
                          </Paper>
                        ))}
                      </Box>
                    </>
                  )}
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedNeColumn(null)}>Close</Button>
            </DialogActions>
          </Dialog>
          <Dialog
            open={candidateDialogOpen}
            onClose={() => setCandidateDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Linking candidates</DialogTitle>
            <DialogContent dividers>
              {candidateCellMeta && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Row {candidateCellMeta.rowId}, Column {candidateCellMeta.colIndex}
                  </Typography>
                  <Typography variant="subtitle1">
                    {candidateCellMeta.value ? String(candidateCellMeta.value) : '(empty)'}
                  </Typography>
                </Box>
              )}
              {candidateLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2">Loading candidates…</Typography>
                </Box>
              )}
              {candidateError && (
                <Alert severity="error">{candidateError}</Alert>
              )}
              {!candidateLoading && !candidateError && (
                <Box>
                  {(candidatePayload?.explanation ||
                    candidatePayload?.llm_explanation ||
                    candidatePayload?.meta?.explanation) && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      {candidatePayload?.explanation ||
                        candidatePayload?.llm_explanation ||
                        candidatePayload?.meta?.explanation}
                    </Alert>
                  )}
                  {isNilCandidateSet && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      NIL: no candidate was marked as a match.
                    </Alert>
                  )}
                  {candidateList.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No candidates returned for this cell.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {candidateList.map((candidate) => {
                        const idValue = candidate.id || candidate.entity_id || '';
                        const nameValue = candidate.name || candidate.label || '';
                        const isWinner = candidate.match === true;
                        const isSelected = candidateSelection?.id && idValue
                          ? candidateSelection.id === idValue
                          : candidateSelection?.name === nameValue && nameValue;
                        const typesValue = Array.isArray(candidate.types)
                          ? candidate.types.map((type) => ({
                            id: type.id || type.entity_id || '',
                            name: type.name || type.label || ''
                          }))
                          : Array.isArray(candidate.metadata?.types)
                            ? candidate.metadata.types.map((type) => ({
                              id: type.id || type.entity_id || '',
                              name: type.name || type.label || ''
                            }))
                            : [];
                        const descriptionValue = candidate.description || candidate.metadata?.description;
                        const scoreValue = candidate.confidence_score ?? candidate.score;
                        return (
                          <Paper
                            key={`${candidate.entity_id || candidate.id || candidate.rank}-${candidate.rank}`}
                            variant="outlined"
                            sx={{
                              p: 1.5,
                              borderColor: isSelected ? '#90caf9' : undefined,
                              bgcolor: isSelected ? '#eef4ff' : 'transparent'
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                              <Box sx={{ flex: 1 }}>
                                <Typography
                                  variant="subtitle2"
                                  sx={{ textDecoration: isWinner ? 'underline' : 'none' }}
                                >
                                  {nameValue || idValue || 'Candidate'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  ID: {idValue || 'n/a'}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {candidate.rank !== undefined && candidate.rank !== null && (
                                  <Typography variant="caption" color="text.secondary">
                                    Rank {candidate.rank}
                                  </Typography>
                                )}
                                {isWinner && (
                                  <Chip size="small" label="Winner" color="success" />
                                )}
                                <Button
                                  size="small"
                                  variant={isSelected ? 'contained' : 'outlined'}
                                  onClick={() => handleCandidateSelect(candidate)}
                                >
                                  {isSelected ? 'Selected' : 'Select'}
                                </Button>
                              </Box>
                            </Box>
                            <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                              {candidate.confidence_label && (
                                <Chip size="small" label={`Confidence: ${candidate.confidence_label}`} />
                              )}
                              {scoreValue !== null && scoreValue !== undefined && (
                                <Chip
                                  size="small"
                                  label={`Score: ${scoreValue}`}
                                />
                              )}
                              {candidate.label && (
                                <Chip size="small" label={`Label: ${candidate.label}`} />
                              )}
                              {idValue && (
                                <Chip
                                  size="small"
                                  label="Wikidata"
                                  component={Link}
                                  href={`https://www.wikidata.org/wiki/${idValue}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  clickable
                                />
                              )}
                            </Box>
                            {typesValue.length > 0 && (
                              <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {typesValue.map((type) => (
                                  <Chip
                                    key={`${type.id || type.name}`}
                                    size="small"
                                    label={`${type.name || type.id}${type.id ? ` (${type.id})` : ''}`}
                                  />
                                ))}
                              </Box>
                            )}
                            {descriptionValue && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {descriptionValue}
                              </Typography>
                            )}
                          </Paper>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              {candidateSaveError && (
                <Typography variant="caption" color="error">
                  {candidateSaveError}
                </Typography>
              )}
              <Button onClick={() => setCandidateDialogOpen(false)}>
                Close
              </Button>
              <Button
                onClick={handleCandidateClear}
                disabled={candidateSaving}
              >
                Clear selection
              </Button>
              <Button
                variant="contained"
                onClick={handleCandidateSave}
                disabled={candidateSaving}
              >
                {candidateSaving ? 'Saving...' : 'Save selection'}
              </Button>
            </DialogActions>
          </Dialog>
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              maxHeight: '70vh',
              width: '100%',
              overflow: 'auto',
              '&::-webkit-scrollbar': {
                width: '8px',
                height: '8px'
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: '#f1f1f1'
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#888',
                borderRadius: '4px'
              }
            }}
          >
            <Table
              stickyHeader
              size="medium"
              sx={{
                minWidth: 650,
                tableLayout: 'auto'
              }}
            >
              <TableHead>
              <TableHeader
                headers={data?.header || []}
                columnTypes={columnTypes}
                columnSubtypes={columnSubtypes}
                columnSpecificSubtypes={columnSpecificSubtypes}
                columnDpvAnnotations={columnDpvAnnotations}
                columnReconciliationTypes={reconciliationColumnTypeTopByIndex}
                showDpvAnnotations={showDpvAnnotations}
                onNeColumnClick={(colIndex) => setSelectedNeColumn(colIndex)}
                activeNeColumn={selectedNeColumn}
                showRowSelection={showRowSelection}
                showRowIndex={showRowIndex}
                allRowsSelected={allRowsSelected}
                someRowsSelected={someRowsSelected}
                onToggleAllRows={handleToggleAllRows}
              />
              </TableHead>
              <TableBody>
                {data?.rows?.length > 0 ? (
                  data.rows.map((row) => (
                    <TableRow
                      key={row.idRow}
                      sx={{
                        '&:nth-of-type(odd)': { backgroundColor: '#fafafa' },
                        backgroundColor: selectedRows.has(row.idRow) ? '#e3f2fd' : 'inherit',
                        '&:hover': {
                          backgroundColor: selectedRows.has(row.idRow) ? '#dceeff' : '#f1f7fd'
                        },
                        transition: 'background-color 0.2s'
                      }}
                    >
                      {showRowIndex && (
                        <TableCell
                          sx={{
                            minWidth: 60,
                            maxWidth: 80,
                            verticalAlign: 'top',
                            padding: '10px 12px',
                            textAlign: 'center',
                            bgcolor: '#f5f5f5'
                          }}
                        >
                          {showRowSelection ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                              <Checkbox
                                size="small"
                                checked={selectedRows.has(row.idRow)}
                                onChange={() => toggleRowSelection(row.idRow)}
                              />
                              <Typography variant="caption" color="text.secondary">
                                {row.idRow}
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              {row.idRow}
                            </Typography>
                          )}
                        </TableCell>
                      )}
                      {row.data.map((cell, colIndex) => (
                        (() => {
                          const reconEntry = getReconciliationEntry(row.idRow, colIndex);
                          const reconLabel = reconEntry?.final?.name || reconEntry?.final?.id || '';
                          const hasCandidates = Array.isArray(reconEntry?.candidate_ranking)
                            ? reconEntry.candidate_ranking.length > 0
                            : false;
                          const hasMatch = Array.isArray(reconEntry?.candidate_ranking)
                            ? reconEntry.candidate_ranking.some((candidate) => candidate.match === true)
                            : false;
                          const reconConfidence = reconEntry?.final?.confidence_score;
                          const providerTag = reconEntry?.provider === 'crocodile' ? 'Croc' : 'LL';
                          const reconTitle = reconLabel
                            ? `${reconLabel}${typeof reconConfidence === 'number'
                              ? ` (${Math.round(reconConfidence * 100)}%)`
                              : ''}`
                            : '';
                          const isCellSelected = selectedCells.has(`${row.idRow}:${colIndex}`);
                          const isReconciled = Boolean(reconLabel);
                          const isNil = reconEntry?.provider !== 'crocodile' && !reconLabel && hasCandidates && !hasMatch;
                          const showCandidatesChip = !reconLabel && hasCandidates && !isNil;
                          return (
                        <TableCell
                          key={colIndex}
                          sx={{
                            minWidth: 100,
                            maxWidth: 300,
                            verticalAlign: 'top',
                            padding: '10px 16px',
                            cursor: reconcileScope === 'cell' ? 'pointer' : 'default',
                            bgcolor: isCellSelected
                              ? '#e8f0fe'
                              : isReconciled
                                ? '#f7fbff'
                                : 'inherit',
                            borderBottom: isCellSelected ? '2px solid #90caf9' : undefined
                          }}
                          onClick={() => {
                            if (reconcileScope === 'cell') {
                              toggleCellSelection(row.idRow, colIndex);
                            }
                          }}
                        >
                          <TruncatedCell content={cell} maxLength={150} />
                          {reconLabel && (
                            <Tooltip title={reconTitle || 'Linked entity'} arrow>
                              <Chip
                                label={`${providerTag}: ${reconLabel}`}
                                size="small"
                                variant="outlined"
                                onClick={(event) => openCandidates(event, row.idRow, colIndex, cell, reconEntry?.provider)}
                                sx={{
                                  mt: 0.5,
                                  fontSize: '0.6rem',
                                  color: '#1a4f8b',
                                  borderColor: '#c4d8f2',
                                  bgcolor: '#eef4ff'
                                }}
                              />
                            </Tooltip>
                          )}
                          {isNil && (
                            <Chip
                              label={`${providerTag}: NIL`}
                              size="small"
                              variant="outlined"
                              onClick={(event) => openCandidates(event, row.idRow, colIndex, cell, reconEntry?.provider)}
                              sx={{
                                mt: 0.5,
                                fontSize: '0.6rem',
                                color: '#9a6700',
                                borderColor: '#f3d19e',
                                bgcolor: '#fff8e1'
                              }}
                            />
                          )}
                          {showCandidatesChip && (
                            <Chip
                              label={`${providerTag}: candidates`}
                              size="small"
                              variant="outlined"
                              onClick={(event) => openCandidates(event, row.idRow, colIndex, cell, reconEntry?.provider)}
                              sx={{
                                mt: 0.5,
                                fontSize: '0.6rem',
                                color: '#4a5568',
                                borderColor: '#d4d8df',
                                bgcolor: '#f5f7fb'
                              }}
                            />
                          )}
                        </TableCell>
                          );
                        })()
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={(data?.header || []).length + (showRowIndex ? 1 : 0)}
                      align="center"
                      sx={{ py: 4 }}
                    >
                      {loading ? (
                        <CircularProgress size={32} />
                      ) : (
                        <Typography variant="body1" color="text.secondary">
                          No rows found{hasActiveFilters ? ' matching the current filters' : ''}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 2,
            borderTop: '1px solid rgba(0, 0, 0, 0.12)'
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {data?.rows?.length > 0 ? `${data.rows.length} rows displayed` : 'No rows found'}
            {data?.total_matches && ` (${data.total_matches} total matches)`}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Button
              disabled={!prevCursor}
              onClick={handlePreviousPage}
              startIcon={<NavigateBeforeIcon />}
              sx={{ mr: 1 }}
              color="primary"
              variant="outlined"
              size="small"
            >
              Previous
            </Button>

            <Box
              sx={{
                px: 2,
                py: 1,
                borderRadius: 1,
                bgcolor: 'action.selected',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                Page {currentPage}
              </Typography>
            </Box>

            <Button
              disabled={!nextCursor}
              onClick={handleNextPage}
              endIcon={<NavigateNextIcon />}
              sx={{ ml: 1 }}
              color="primary"
              variant="outlined"
              size="small"
            >
              Next
            </Button>
          </Box>
        </Box>
      </Card>

      <TypeFilterModal
        open={typeFilterOpen}
        onClose={() => setTypeFilterOpen(false)}
        onApplyFilter={handleApplyFilter}
        columnName="All columns"
        availableTypes={availableTypes || []}
        loading={loading}
      />

      <Dialog open={autoIdentifyOpen} onClose={() => setAutoIdentifyOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Auto identify column types</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Moose samples table rows and uses your LLM service to assign NE/LIT subtypes. You can
            tweak the result in the column editor afterward.
          </Typography>
          {renderLlmSettingsFields()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAutoIdentifyOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitAutoIdentify}
            disabled={autoIdentifySubmitting}
          >
            {autoIdentifySubmitting ? 'Starting…' : 'Run auto identify'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dpvIdentifyOpen} onClose={() => setDpvIdentifyOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Annotate columns with DPV</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Moose uses your LLM service to map columns to DPV (privacy) types. DPV annotations are
            shown separately from NE/LIT column types.
          </Typography>
          {renderLlmSettingsFields()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDpvIdentifyOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitDpvAnnotation}
            disabled={dpvIdentifySubmitting}
          >
            {dpvIdentifySubmitting ? 'Starting...' : 'Run DPV annotation'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={columnEditorOpen} onClose={() => setColumnEditorOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Column Types</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Update the NE/LIT classification for each column. Semantic (KG) types are assigned separately to NE columns.
          </Typography>
          <Grid container spacing={2}>
            {(data?.header || []).map((header, idx) => (
              <Grid item xs={12} md={6} key={idx}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid #eee',
                    borderRadius: 1,
                    p: 1,
                    bgcolor: '#fafafa'
                  }}
                >
                  <Chip label={`Col ${idx}: ${header}`} sx={{ mr: 2 }} color="primary" />
                  <FormControl size="small" sx={{ minWidth: 110, mr: 2 }}>
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={columnClassification[idx]?.type || 'IGNORED'}
                      label="Type"
                      onChange={e => setColumnClassification(prev => ({
                        ...prev,
                        [idx]: {
                          type: e.target.value,
                          subtype: '',
                          rawSubtype: '',
                          derivedSubtype: ''
                        }
                      }))}
                    >
                      {COLUMN_TYPES.map((type) => (
                        <MenuItem key={type} value={type}>{type}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {columnClassification[idx]?.type === 'NE' && (
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <InputLabel>Subtype</InputLabel>
                      <Select
                        value={columnClassification[idx]?.subtype || ''}
                        label="Subtype"
                        onChange={e => setColumnClassification(prev => ({
                          ...prev,
                          [idx]: {
                            ...prev[idx],
                            subtype: e.target.value,
                            rawSubtype: e.target.value,
                            derivedSubtype: e.target.value
                          }
                        }))}
                      >
                        {buildSubtypeOptions('NE', columnClassification[idx]?.subtype).map((subtype) => (
                          <MenuItem key={subtype} value={subtype}>{subtype}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  {columnClassification[idx]?.type === 'LIT' && (
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <InputLabel>Subtype</InputLabel>
                      <Select
                        value={columnClassification[idx]?.subtype || ''}
                        label="Subtype"
                        onChange={e => setColumnClassification(prev => ({
                          ...prev,
                          [idx]: {
                            ...prev[idx],
                            subtype: e.target.value,
                            rawSubtype: '',
                            derivedSubtype: e.target.value
                          }
                        }))}
                      >
                        {buildSubtypeOptions('LIT', columnClassification[idx]?.subtype).map((subtype) => (
                          <MenuItem key={subtype} value={subtype}>{subtype}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </Box>
              </Grid>
            ))}
          </Grid>
          {columnEditorError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {columnEditorError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setColumnEditorOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveColumnEditor}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TableDataViewer;
