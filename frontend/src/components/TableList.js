import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getTables, deleteTable, uploadTable } from '../services/apiServices';
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
} from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';
import DeleteIcon from '@mui/icons-material/Delete';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

const LIT_TYPES = ["NUMBER", "STRING", "DATETIME"];
const NER_TYPES = ["LOCATION", "ORGANIZATION", "PERSON", "OTHER"];
const COLUMN_TYPES = ["LIT", "NE", "IGNORED"];

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
  const [csvPreviewRows, setCsvPreviewRows] = useState([]); // NEW: preview rows

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
        
        const encodedName = encodeURIComponent(datasetName);
        const response = await getTables(encodedName, historyItem.page, 10, options);
        
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
    setCsvPreviewRows([]); // reset preview
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
    setUploadProgress(0);
    setColumnHeaders([]);
    setColumnClassification({});
    setShowColumnTypePanel(false);
    setCsvPreviewRows([]); // reset preview

    if (selectedFile) {
      Papa.parse(selectedFile, {
        preview: 5, // NEW: preview first 5 rows
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            setColumnHeaders(results.data[0]);
            setCsvPreviewRows(results.data.slice(1, 6)); // up to 5 rows after header
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
    let hasClassification = false;
    Object.entries(columnClassification).forEach(([idx, { type, subtype }]) => {
      if (type === "NE" && subtype) {
        NE[idx] = subtype;
        hasClassification = true;
      } else if (type === "LIT" && subtype) {
        LIT[idx] = subtype;
        hasClassification = true;
      }
      // IGNORED columns are not counted as classification
    });
    if (!hasClassification) return null; // All columns IGNORED, treat as no classification
    const payload = {};
    if (Object.keys(NE).length) payload.NE = NE;
    if (Object.keys(LIT).length) payload.LIT = LIT;
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
      await uploadTable(datasetName, file, classificationPayload);
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

  const canGoForward = historyIndex < paginationHistory.length - 1 || nextCursor;
  const canGoBackward = historyIndex > 0;

  if (loading) {
    return <CircularProgress />;
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1000, bgcolor: 'background.paper', margin: 'auto', p: 2 }}>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <Link color="inherit" onClick={() => navigate('/dataset')} sx={{ cursor: 'pointer' }}>
          Datasets
        </Link>
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
                  table.status === 'DONE' ? 'green' : 
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

            {/* Info about column classification */}
            <Box sx={{ mt: 3, mb: 2 }}>
              <Alert severity="info" sx={{ mb: 1 }}>
                <b>Column classification is optional.</b> <br />
                If you do <b>not</b> specify column types, Koala will <b>automatically classify columns</b> using its entity linking algorithm.
              </Alert>
              <Typography variant="body2" color="text.secondary">
                <b>Tip:</b> You can preview the first 5 rows of your table below to help you decide if you want to specify column types.
              </Typography>
            </Box>

            {/* CSV preview table */}
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

            {/* Column classification panel */}
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
                  <b>Tip:</b> Columns set as <b>IGNORED</b> will not be used for annotation.<br />
                  <b>If you leave all columns as IGNORED, Koala will automatically classify columns for you.</b>
                </Typography>
              </Box>
            )}

            {/* Visual indicator for automatic classification */}
            {!showColumnTypePanel || Object.values(columnClassification).every(c => c.type === "IGNORED") ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                <b>Automatic column classification will be applied by Koala.</b>
              </Alert>
            ) : null}

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