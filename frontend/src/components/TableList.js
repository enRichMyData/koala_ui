import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getTables,
  deleteTable,
  uploadTable,
  exportTableCsv,
  getLlmSettings,
  updateLlmSettings
} from '../services/apiServices';
import Papa from 'papaparse';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  Breadcrumbs,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Chip,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  FormControlLabel,
  Checkbox,
  TextField,
} from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';
import DeleteIcon from '@mui/icons-material/Delete';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { COLUMN_TYPES, LIT_TYPES, NER_TYPES } from '../constants/columnTypes';

const TableList = () => {
  const navigate = useNavigate();
  const { datasetName } = useParams();
  const [tables, setTables] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [paginationHistory, setPaginationHistory] = useState([{ page: 1, nextCursor: null }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [columnHeaders, setColumnHeaders] = useState([]);
  const [columnClassification, setColumnClassification] = useState({});
  const [showColumnTypePanel, setShowColumnTypePanel] = useState(false);
  const [csvPreviewRows, setCsvPreviewRows] = useState([]);
  const [autoDetectColumns, setAutoDetectColumns] = useState(false);
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

  const currentHistoryRef = useRef(paginationHistory[historyIndex]);
  useEffect(() => {
    currentHistoryRef.current = paginationHistory[historyIndex];
  }, [paginationHistory, historyIndex]);

  useEffect(() => {
    const fetchTables = async () => {
      setLoading(true);
      try {
        const historyItem = currentHistoryRef.current;
        const options = {};
        
        if (historyItem.nextCursor) {
          options.nextCursor = historyItem.nextCursor;
        }
        
        const response = await getTables(datasetName, historyItem.page, 10, options);
        
        if (response.data && response.data.length > 0) {
          setTables(response.data);
          setCurrentPage(response.pagination.currentPage);
          setNextCursor(response.pagination.next_cursor);
          
          if (historyIndex === paginationHistory.length - 1 && response.pagination.next_cursor) {
            setPaginationHistory(prev => [
              ...prev.slice(0, historyIndex + 1),
              { 
                page: historyItem.page + 1, 
                nextCursor: response.pagination.next_cursor
              }
            ]);
          }
          
          setError('');
        } else {
          setTables([]);
          setError('No tables found for this dataset.');
        }
      } catch (error) {
        console.error('Failed to fetch tables:', error);
        setError('Failed to fetch tables');
      } finally {
        setLoading(false);
      }
    };

    fetchTables();
  }, [datasetName, historyIndex, paginationHistory]);

  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      try {
        const settings = await getLlmSettings();
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
      }
    };
    loadSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  const handlePreviousPage = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setCurrentPage(paginationHistory[historyIndex - 1].page);
    }
  };

  const handleNextPage = () => {
    if (historyIndex < paginationHistory.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setCurrentPage(paginationHistory[historyIndex + 1].page);
    } else if (nextCursor) {
      setHistoryIndex(prev => prev + 1);
      setCurrentPage(prev => prev + 1);
    }
  };

  const handleOpenDeleteDialog = (tableName) => {
    setSelectedTable(tableName);
    setOpenDeleteDialog(true);
  };

  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setSelectedTable(null);
  };

  const confirmDeleteTable = async () => {
    try {
      await deleteTable(datasetName, selectedTable);
      setTables(tables.filter((table) => table.tableName !== selectedTable));
    } catch (error) {
      console.error('Failed to delete table:', error);
      setError('Failed to delete table');
    } finally {
      handleCloseDeleteDialog();
    }
  };

  const handleOpenUploadDialog = () => {
    setOpenUploadDialog(true);
  };

  const handleCloseUploadDialog = () => {
    setOpenUploadDialog(false);
    setFile(null);
    setUploadProgress(0);
    setColumnHeaders([]);
    setColumnClassification({});
    setShowColumnTypePanel(false);
    setCsvPreviewRows([]);
    setAutoDetectColumns(false);
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
    setUploadProgress(0);
    setColumnHeaders([]);
    setColumnClassification({});
    setShowColumnTypePanel(false);
    setCsvPreviewRows([]);
    setAutoDetectColumns(false);

    if (selectedFile) {
      Papa.parse(selectedFile, {
        preview: 5,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            setColumnHeaders(results.data[0]);
            setCsvPreviewRows(results.data.slice(1, 6));
            const initialClassification = {};
            results.data[0].forEach((_, idx) => {
              initialClassification[idx] = { type: "IGNORED", subtype: "" };
            });
            setColumnClassification(initialClassification);
            setShowColumnTypePanel(true);
          }
        },
        error: (err) => {
          setError('Failed to parse CSV: ' + err.message);
        }
      });
    }
  };

  const handleColumnTypeChange = (colIdx, type) => {
    setColumnClassification((prev) => ({
      ...prev,
      [colIdx]: { type, subtype: "" }
    }));
  };

  const handleColumnSubtypeChange = (colIdx, subtype) => {
    setColumnClassification((prev) => ({
      ...prev,
      [colIdx]: { ...prev[colIdx], subtype }
    }));
  };

  const buildColumnClassificationPayload = () => {
    const NE = {};
    const LIT = {};
    const IGNORED = [];
    let hasClassification = false;
    Object.entries(columnClassification).forEach(([idx, { type, subtype }]) => {
      if (type === "NE" && subtype) {
        NE[idx] = subtype;
        hasClassification = true;
      } else if (type === "LIT" && subtype) {
        LIT[idx] = subtype;
        hasClassification = true;
      }
      else {
        IGNORED.push(idx.toString());
      }
    });
    if (!hasClassification) return null;
    const payload = {};
    if (Object.keys(NE).length) payload.NE = NE;
    if (Object.keys(LIT).length) payload.LIT = LIT;
    if (IGNORED.length) payload.IGNORED = IGNORED;
    return payload;
  };

  const handleUploadTable = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    try {
      setUploadProgress(10);
      let classificationPayload = null;
      if (showColumnTypePanel) {
        classificationPayload = buildColumnClassificationPayload();
      }
      const llmProvider = autoIdentifyConfig.provider.trim();
      const llmModel = autoIdentifyConfig.model.trim();
      if (autoDetectColumns) {
        if (llmOptions.providers.length > 0 && llmProvider && !llmOptions.providers.includes(llmProvider)) {
          setError('Selected LLM provider is not supported.');
          return;
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
      }
      await uploadTable(datasetName, file, classificationPayload, {
        autoDetect: autoDetectColumns
      });
      setUploadProgress(100);

      const response = await getTables(datasetName, currentPage);
      setTables(response.data);
      setError('');
    } catch (error) {
      console.error('Failed to upload table:', error);
      setError('Failed to upload table: ' + (error.response?.data?.detail || error.message));
    } finally {
      handleCloseUploadDialog();
    }
  };

  const handleExport = async (tableName) => {
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
      console.error('Export failed:', err);
      setError('Export failed: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const canGoForward = historyIndex < paginationHistory.length - 1 || nextCursor;
  const canGoBackward = historyIndex > 0;

  if (loading) {
    return <CircularProgress />;
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1000, bgcolor: 'background.paper', margin: 'auto', p: 2 }}>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <Button color="inherit" onClick={() => navigate('/dataset')} sx={{ cursor: 'pointer', textTransform: 'none', padding: 0, minWidth: 0,  fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit', textDecoration: 'underline',  '&:hover': {
        textDecoration: 'underline',
      }, }}>
          Datasets
        </Button>
        <Typography color="text.primary" noWrap>
          {datasetName}
        </Typography>
      </Breadcrumbs>

      <Typography variant="h6" component="div">
        Tables in Dataset: {datasetName}
      </Typography>
      <Button 
        variant="contained" 
        color="primary" 
        startIcon={<FileUploadIcon />} 
        onClick={handleOpenUploadDialog}
        sx={{ my: 2 }}
      >
        Upload New Table
      </Button>
      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
      <List>
        {tables.length > 0 ? (
          tables.map((table, index) => (
            <ListItem 
              key={index} 
              button 
              component={Link} 
              to={`/dataset/${encodeURIComponent(datasetName)}/table/${encodeURIComponent(table.tableName)}`}
              sx={{ 
                borderLeft: `4px solid ${
                  table.status === 'READY' || table.status === 'DONE' ? 'green' :
                  table.status === 'processing' || table.status === 'DOING' ? 'orange' : 'grey'
                }`,
                mb: 1
              }}
            >
              <ListItemIcon>
                <TableChartIcon />
              </ListItemIcon>
              <ListItemText 
                primary={table.tableName} 
                secondary={
                  <>
                    <Typography component="span" variant="body2">
                      Rows: {table.totalRows} | Status: {table.status || 'Unknown'}
                      {table.classificationStatus && ` | Types: ${table.classificationStatus}`}
                    </Typography>
                    {table.createdAt && (
                      <Typography component="span" variant="body2" sx={{ ml: 2 }}>
                        Created: {new Date(table.createdAt).toLocaleString()}
                      </Typography>
                    )}
                  </>
                }
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  aria-label="export"
                  sx={{ mr: 1 }}
                  disabled={table.status !== 'READY'}
                  onClick={e => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleExport(table.tableName);
                  }}
                >
                  <FileDownloadIcon />
                </IconButton>
                <IconButton edge="end" aria-label="delete" onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOpenDeleteDialog(table.tableName);
                }}>
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))
        ) : (
          <ListItem>
            <ListItemText primary="No tables found" />
          </ListItem>
        )}
      </List>
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
        <Button
          disabled={!canGoBackward}
          onClick={handlePreviousPage}
          startIcon={<NavigateBeforeIcon />}
          sx={{ mr: 2 }}
          color="primary"
          variant="outlined"
          size="small"
        >
          Previous
        </Button>
        
        <Box sx={{ 
          px: 2, 
          py: 1, 
          borderRadius: 1, 
          bgcolor: 'action.selected', 
          display: 'flex', 
          alignItems: 'center'
        }}>
          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
            Page {currentPage}
          </Typography>
        </Box>
        
        <Button
          disabled={!canGoForward}
          onClick={handleNextPage}
          endIcon={<NavigateNextIcon />}
          sx={{ ml: 2 }}
          color="primary"
          variant="outlined"
          size="small"
        >
          Next
        </Button>
      </Box>
      
      <Dialog open={openDeleteDialog} onClose={handleCloseDeleteDialog}>
        <DialogTitle>{"Confirm Delete"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the table "{selectedTable}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} color="primary">
            Cancel
          </Button>
          <Button onClick={confirmDeleteTable} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openUploadDialog} onClose={handleCloseUploadDialog} maxWidth="md" fullWidth>
        <DialogTitle>Upload New Table</DialogTitle>
        <DialogContent>
          <form onSubmit={handleUploadTable}>
            <Typography variant="body1" gutterBottom sx={{ mt: 2 }}>
              Select a CSV file to upload:
            </Typography>
            <input type="file" accept=".csv" onChange={handleFileChange} required />

            <Box sx={{ mt: 3, mb: 2 }}>
              <Alert severity="info" sx={{ mb: 1 }}>
                <b>Column classification is optional.</b> <br />
                You can set column types manually now or request automatic identification (placeholder).
              </Alert>
              <Typography variant="body2" color="text.secondary">
                <b>Tip:</b> You can preview the first 5 rows of your table below to help you decide if you want to specify column types.
              </Typography>
            </Box>

            {columnHeaders.length > 0 && csvPreviewRows.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  <b>Preview (first 5 rows):</b>
                </Typography>
                <Table size="small" sx={{ border: '1px solid #eee', mb: 1 }}>
                  <TableHead>
                    <TableRow>
                      {columnHeaders.map((header, idx) => (
                        <TableCell key={idx} sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>
                          {header}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {csvPreviewRows.map((row, ridx) => (
                      <TableRow key={ridx}>
                        {columnHeaders.map((_, cidx) => (
                          <TableCell key={cidx}>
                            {row[cidx] !== undefined ? String(row[cidx]) : ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}

            {showColumnTypePanel && columnHeaders.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  <b>Classify Columns</b>
                  <Tooltip title="Specify the type for each column. IGNORED columns will not be annotated. If you skip this step, Koala will classify columns automatically.">
                    <span style={{ marginLeft: 8, color: '#888', cursor: 'help' }}>ⓘ</span>
                  </Tooltip>
                </Typography>
                <Grid container spacing={2}>
                  {columnHeaders.map((header, idx) => (
                    <Grid item xs={12} md={6} key={idx}>
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid #eee',
                        borderRadius: 1,
                        p: 1,
                        mb: 1,
                        bgcolor: '#fafafa'
                      }}>
                        <Chip label={`Col ${idx}: ${header}`} sx={{ mr: 2 }} color="primary" />
                        <FormControl size="small" sx={{ minWidth: 110, mr: 2 }}>
                          <InputLabel>Type</InputLabel>
                          <Select
                            value={columnClassification[idx]?.type || "IGNORED"}
                            label="Type"
                            onChange={e => handleColumnTypeChange(idx, e.target.value)}
                          >
                            {COLUMN_TYPES.map((type) => (
                              <MenuItem key={type} value={type}>{type}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        {columnClassification[idx]?.type === "NE" && (
                          <FormControl size="small" sx={{ minWidth: 130 }}>
                            <InputLabel>Subtype</InputLabel>
                            <Select
                              value={columnClassification[idx]?.subtype || ""}
                              label="Subtype"
                              onChange={e => handleColumnSubtypeChange(idx, e.target.value)}
                              required
                            >
                              {NER_TYPES.map((subtype) => (
                                <MenuItem key={subtype} value={subtype}>{subtype}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                        {columnClassification[idx]?.type === "LIT" && (
                          <FormControl size="small" sx={{ minWidth: 130 }}>
                            <InputLabel>Subtype</InputLabel>
                            <Select
                              value={columnClassification[idx]?.subtype || ""}
                              label="Subtype"
                              onChange={e => handleColumnSubtypeChange(idx, e.target.value)}
                              required
                            >
                              {LIT_TYPES.map((subtype) => (
                                <MenuItem key={subtype} value={subtype}>{subtype}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                      </Box>
                    </Grid>
                  ))}
                </Grid>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  <b>Tip:</b> Columns set as <b>IGNORED</b> will not be tagged with types.<br />
                  You can update column typing later from the table view.
                </Typography>
              </Box>
            )}

            <FormControlLabel
              control={
                <Checkbox
                  checked={autoDetectColumns}
                  onChange={(e) => setAutoDetectColumns(e.target.checked)}
                />
              }
              label="Auto-identify column types after upload (Moose)"
            />

            {autoDetectColumns && (
              <Box sx={{ mt: 2 }}>
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
              </Box>
            )}

            {uploadProgress > 0 && (
              <Box sx={{ width: '100%', mt: 2 }}>
                <Box sx={{
                  width: `${uploadProgress}%`,
                  height: '4px',
                  bgcolor: 'primary.main',
                  transition: 'width 0.5s'
                }} />
                <Typography variant="body2" align="center" sx={{ mt: 1 }}>
                  {uploadProgress < 100 ? 'Uploading...' : 'Upload complete!'}
                </Typography>
              </Box>
            )}

            <DialogActions>
              <Button onClick={handleCloseUploadDialog} color="secondary">
                Cancel
              </Button>
              <Button
                type="submit"
                color="primary"
                variant="contained"
                disabled={!file || uploadProgress > 0}
                startIcon={<FileUploadIcon />}
              >
                Upload
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

    </Box>
  );
};

export default TableList;
