import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getTableData, 
  getTableStatus, 
  exportTableCsv,
  runLinkingTask,
  updateAnnotation
} from '../services/apiServices';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, Tooltip, IconButton, Chip, Card, CardHeader, CardContent,
  Button, Divider, Skeleton, LinearProgress, Breadcrumbs, Link, Dialog, DialogTitle,
  DialogContent, DialogActions, FormGroup, FormControlLabel, Checkbox
} from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ReadMoreIcon from '@mui/icons-material/ReadMore';
import CompressIcon from '@mui/icons-material/Compress';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FilterIcon from '@mui/icons-material/FilterList';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import EntityDetailsModal from './EntityDetailsModal';
import TableHeader from './TableHeader';
import TableSearch from './TableSearch';
import TableSortControls from './TableSortControls';
import TypeFilterModal from './TypeFilterModal';
import EntityLinkingDialog from './EntityLinkingDialog';

// Component for truncating text in cells
const TruncatedCell = ({ content, maxLength = 100, compact = false }) => {
  const [expanded, setExpanded] = useState(false);
  
  if (!content) return null;
  const text = String(content);
  
  if (text.length <= maxLength) {
    return <span>{text}</span>;
  }

  if (expanded) {
    return (
      <Box sx={{ position: 'relative' }}>
        <Typography variant={compact ? "caption" : "body2"}>
          {text}
          <IconButton 
            size="small" 
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
            }}
            sx={{ ml: 0.5, p: 0.5 }}
          >
            <CompressIcon fontSize="small" />
          </IconButton>
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <Typography variant={compact ? "caption" : "body2"}>
        {text.substring(0, maxLength)}...
        <IconButton 
          size="small" 
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          sx={{ ml: 0.5, p: 0.5 }}
        >
          <ReadMoreIcon fontSize="small" />
        </IconButton>
      </Typography>
    </Box>
  );
};

// Component for cell with entity linking
const LinkedEntityCell = ({ value, entityData, onClick, compact = false }) => {
  const getScoreColor = (score) => {
    if (score === null || score === undefined) return '#e0e0e0'; // gray for missing scores
    if (score > 0.8) return '#a5d6a7'; // light green
    if (score >= 0.5) return '#fff59d'; // light yellow
    return '#ffab91'; // light red
  };

  const getScoreBorderColor = (score) => {
    if (score === null || score === undefined) return '#9e9e9e'; // darker gray for missing scores
    if (score > 0.8) return '#388e3c'; // darker green
    if (score >= 0.5) return '#fbc02d'; // darker yellow
    return '#e64a19'; // darker red
  };

  if (!entityData?.candidates || entityData.candidates.length === 0) {
    return <TruncatedCell content={value} maxLength={150} compact={compact} />;
  }

  const topCandidate = entityData.candidates[0];
  const score = topCandidate.score !== undefined ? topCandidate.score : null;
  const tooltipLines = [
    `${topCandidate.name} (${topCandidate.id})`,
    score !== null ? `Score: ${score.toFixed(2)}` : 'Score: N/A',
    topCandidate.description || 'No description',
    `Types: ${topCandidate.types ? topCandidate.types.map(t => t.name).join(', ') : 'N/A'}`
  ];
  if (entityData?.explanation) {
    tooltipLines.push('');
    tooltipLines.push(`Why: ${entityData.explanation}`);
  }
  const tooltipContent = tooltipLines.join('\n');

  const isPending = entityData?.pending;

  return (
    <Box 
      onClick={onClick} 
      sx={{
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        padding: compact ? '2px 4px' : '4px 8px',
        borderRadius: '4px',
        backgroundColor: getScoreColor(score),
        border: `1px solid ${getScoreBorderColor(score)}`,
        transition: 'all 0.2s',
        '&:hover': {
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          filter: 'brightness(0.95)'
        }
      }}
    >
      {isPending && (
        <Chip
          label="Pending"
          color="info"
          size="small"
          sx={{
            position: 'absolute',
            top: -8,
            right: -8
          }}
        />
      )}
      <Tooltip title={tooltipContent} arrow placement="top">
        <Box sx={{ width: '100%' }}>
          <Typography variant={compact ? "caption" : "body2"} sx={{ fontWeight: 'medium' }}>
            <TruncatedCell content={value} maxLength={100} compact={compact} />
          </Typography>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            mt: 0.5
          }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: compact ? '0.65rem' : '0.7rem' }}>
              {topCandidate.id}
            </Typography>
            <Chip
              label={score !== null ? score.toFixed(2) : 'N/A'}
              size="small"
              sx={{ 
                height: compact ? 16 : 20, 
                fontSize: compact ? '0.65rem' : '0.7rem',
                backgroundColor: getScoreBorderColor(score),
                color: 'white'
              }}
            />
          </Box>
        </Box>
      </Tooltip>
    </Box>
  );
};

const ANNOTATION_FIELDS = ['id', 'name', 'description', 'types', 'score'];

const TableDataViewer = () => {
  const navigate = useNavigate();
  const { datasetName, tableName } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [nextCursor, setNextCursor] = useState(null);
  const [prevCursor, setPrevCursor] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [compact, setCompact] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchColumns, setSearchColumns] = useState([]);
  const [activeFilters, setActiveFilters] = useState({
    column: null,
    includeTypes: [],
    excludeTypes: []
  });
  const [sortParams, setSortParams] = useState({
    sortBy: null,
    column: null,
    sortDirection: 'desc'
  });
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [selectedFilterColumn, setSelectedFilterColumn] = useState(null);
  const [availableColumnTypes, setAvailableColumnTypes] = useState([]);
  const [progressInfo, setProgressInfo] = useState(null);
  const [linkingDialogOpen, setLinkingDialogOpen] = useState(false);
  const [linkingLoading, setLinkingLoading] = useState(false);
  const [linkingError, setLinkingError] = useState(null);
  const [pendingLinkResults, setPendingLinkResults] = useState(null);
  const [savingLinkResults, setSavingLinkResults] = useState(false);
  const [linkSaveProgress, setLinkSaveProgress] = useState({ completed: 0, total: 0 });
  const [linkSaveError, setLinkSaveError] = useState(null);

  const baseDataRef = React.useRef(null);

  const [openExportDialog, setOpenExportDialog] = useState(false);
  const [exportFields, setExportFields] = useState(ANNOTATION_FIELDS);

  const handleOpenExport = () => setOpenExportDialog(true);
  const handleCloseExport = () => setOpenExportDialog(false);
  const handleExportFieldToggle = (field) =>
    setExportFields(prev =>
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );

  const handleConfirmExport = async () => {
    try {
      setLoading(true);
      const res = await exportTableCsv(datasetName, tableName, exportFields);
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `${datasetName}_${tableName}_export.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export failed:', err);
      setError('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
      handleCloseExport();
    }
  };

  const fetchTableData = useCallback(async (options = {}) => {
    setLoading(true);
    
    try {
      const fetchOptions = {
        ...options,
        search: searchText || undefined,
        searchColumns: searchColumns?.length > 0 ? searchColumns : undefined,
        column: activeFilters.column !== null ? activeFilters.column : undefined,
        includeTypes: activeFilters.includeTypes?.length > 0 ? activeFilters.includeTypes : undefined,
        excludeTypes: activeFilters.excludeTypes?.length > 0 ? activeFilters.excludeTypes : undefined,
        sortBy: sortParams.sortBy || undefined,
        sortDirection: sortParams.sortDirection || undefined
      };
      
      if (sortParams.sortBy === 'confidence' && sortParams.column !== undefined) {
        fetchOptions.column = sortParams.column;
      }

      const response = await getTableData(datasetName, tableName, 10, fetchOptions);
      console.log('Fetched table data:', response);
      if (response.data) {
        const freshData = response.data;
        baseDataRef.current = JSON.parse(JSON.stringify(freshData));
        setData(freshData);
        setNextCursor(response.pagination?.next_cursor || null);
        setPrevCursor(response.pagination?.prev_cursor || null);
        setPendingLinkResults(null);
      } else {
        setError('No data available');
      }
    } catch (err) {
      console.error('Error fetching table data:', err);
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  }, [datasetName, tableName, searchText, searchColumns, activeFilters, sortParams]);

  useEffect(() => {
    let cancelled = false;
    setProgressInfo(null);

    getTableStatus(datasetName, tableName)
      .then(status => {
        if (!cancelled) {
          setProgressInfo(status);
        }
      })
      .catch(() => {
        if (!cancelled) setProgressInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, [datasetName, tableName]);

  useEffect(() => {
    fetchTableData();
    // Only re-run if dataset/table changes
    // eslint-disable-next-line
  }, [fetchTableData]);


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
    fetchTableData();
  };

  const handleSortChange = (params) => {
    setSortParams(params);
    setCurrentPage(1);
    fetchTableData();
  };

  const handleColumnHeaderClick = (columnIndex, columnName) => {
    const columnData = data?.column_types?.[columnIndex];
    if (columnData && columnData.types && columnData.types.length > 0) {
      setSelectedFilterColumn(columnIndex);
      setAvailableColumnTypes(columnData.types);
      setTypeFilterOpen(true);
    } else {
      console.log("No type information available for this column");
    }
  };

  const handleApplyFilter = (filterData) => {
    setActiveFilters(filterData);
    setCurrentPage(1);
    fetchTableData();
  };

  const handleClearFilters = () => {
    setSearchText('');
    setSearchColumns([]);
    setActiveFilters({
      column: null,
      includeTypes: [],
      excludeTypes: []
    });
    setSortParams({
      sortBy: null,
      column: null,
      sortDirection: 'desc'
    });
    setCurrentPage(1);
    fetchTableData();
  };

  const toggleCompact = () => {
    setCompact(!compact);
  };

  const handleOpenLinkingDialog = () => {
    setLinkingError(null);
    setLinkingDialogOpen(true);
  };

  const applyLinkingResults = useCallback((linkingResponse) => {
    if (!linkingResponse || !Array.isArray(linkingResponse.cells) || !data?.header) {
      setLinkingError('Linking service did not return any predictions.');
      return;
    }

    const baseClone = baseDataRef.current
      ? JSON.parse(JSON.stringify(baseDataRef.current))
      : JSON.parse(JSON.stringify(data));

    if (!baseClone?.rows) {
      setLinkingError('Unable to merge predictions into the current table.');
      return;
    }

    const pendingCells = [];
    linkingResponse.cells.forEach((cell) => {
      const rowIndex = baseClone.rows.findIndex(r => r.idRow === cell.rowId);
      if (rowIndex === -1) return;
      const columnIndex = cell.columnIndex;
      if (columnIndex === undefined || columnIndex === null) return;

      const candidates = (cell.candidates || []).map(candidate => ({
        ...candidate
      }));
      if (candidates.length === 0) return;

      if (!baseClone.rows[rowIndex].linked_entities) {
        baseClone.rows[rowIndex].linked_entities = [];
      }

      const explanation = cell.explanation || null;
      const entityPayload = {
        idColumn: columnIndex,
        columnName: cell.columnName || data.header[columnIndex] || `Column ${columnIndex}`,
        candidates,
        pending: true,
        source: linkingResponse.provider || 'external',
        identifier: cell.identifier || candidates[0]?.id,
        explanation
      };

      const existingIdx = baseClone.rows[rowIndex].linked_entities.findIndex(
        entity => entity.idColumn === columnIndex
      );

      if (existingIdx > -1) {
        baseClone.rows[rowIndex].linked_entities[existingIdx] = entityPayload;
      } else {
        baseClone.rows[rowIndex].linked_entities.push(entityPayload);
      }

      pendingCells.push({
        rowId: cell.rowId,
        columnIndex,
        columnName: entityPayload.columnName,
        candidates,
        explanation
      });
    });

    if (pendingCells.length === 0) {
      setLinkingError('Linking completed without returning usable predictions.');
      return;
    }

    setData(baseClone);
    setPendingLinkResults({
      provider: linkingResponse.provider,
      cells: pendingCells
    });
    setLinkingError(null);
  }, [data]);

  const handleStartLinking = useCallback(async ({ columnIndices = [], rowIds = [], provider = 'lion', language }) => {
    if (!data || columnIndices.length === 0 || rowIds.length === 0) {
      setLinkingError('Select at least one column and row to run linking.');
      return;
    }

    setLinkingError(null);
    setPendingLinkResults(null);
    setLinkingLoading(true);

    try {
      const payload = {
        provider,
        column_indices: columnIndices,
        row_ids: rowIds
      };
      if (language) {
        payload.language = language;
      }
      const response = await runLinkingTask(datasetName, tableName, payload);
      applyLinkingResults(response);
      setLinkingDialogOpen(false);
    } catch (err) {
      console.error('Linking error:', err);
      setLinkingError(err?.response?.data?.detail || err?.message || 'Failed to run linking task.');
    } finally {
      setLinkingLoading(false);
    }
  }, [data, datasetName, tableName, applyLinkingResults]);

  const handleDiscardLinkResults = () => {
    if (savingLinkResults) return;
    setLinkSaveError(null);
    setPendingLinkResults(null);
    setLinkSaveProgress({ completed: 0, total: 0 });
    if (baseDataRef.current) {
      const restored = JSON.parse(JSON.stringify(baseDataRef.current));
      setData(restored);
    }
  };

  const handlePersistLinkResults = async () => {
    if (!pendingLinkResults?.cells?.length || savingLinkResults) return;
    setLinkSaveError(null);
    setSavingLinkResults(true);
    setLinkSaveProgress({
      completed: 0,
      total: pendingLinkResults.cells.length
    });

    const failures = [];

    for (const cell of pendingLinkResults.cells) {
      const entityToSave = cell.candidates.find(candidate => candidate.match) || cell.candidates[0];
      if (!entityToSave) {
        setLinkSaveProgress(prev => ({
          ...prev,
          completed: prev.completed + 1
        }));
        continue;
      }

      const winningId = entityToSave.id;
      const normalizedCandidates = (cell.candidates || []).map(candidate => ({
        ...candidate,
        match: candidate.id === winningId
      }));
      const orderedCandidates = [];
      const primaryCandidate = normalizedCandidates.find(candidate => candidate.id === winningId);
      if (primaryCandidate) {
        orderedCandidates.push(primaryCandidate);
      }
      orderedCandidates.push(...normalizedCandidates.filter(candidate => candidate.id !== winningId));

      try {
        await updateAnnotation(
          datasetName,
          tableName,
          cell.rowId,
          cell.columnIndex,
          {
            ...entityToSave,
            match: true,
            candidates: orderedCandidates,
            explanation: cell.explanation || entityToSave.explanation || null
          }
        );
      } catch (err) {
        console.error('Failed to persist annotation:', err);
        failures.push(err);
      } finally {
        setLinkSaveProgress(prev => ({
          ...prev,
          completed: prev.completed + 1
        }));
      }
    }

    setSavingLinkResults(false);

    if (failures.length === 0) {
      setPendingLinkResults(null);
      setLinkSaveProgress({ completed: 0, total: 0 });
      await fetchTableData();
    } else {
      setLinkSaveError(`Failed to save ${failures.length} cell${failures.length > 1 ? 's' : ''}.`);
    }
  };


  const findEntityForCell = (rowId, colId) => {
    if (!data || !data.rows) return null;
    const row = data.rows.find(r => r.idRow === rowId);
    if (!row || !row.linked_entities) return null;
    return row.linked_entities.find(e => e.idColumn === colId);
  };

  const handleCellClick = (rowId, colId, cellValue) => {
    const entity = findEntityForCell(rowId, colId);
    setModalData({
      candidates: entity?.candidates || [],
      rowId: rowId,
      columnId: colId,
      cellValue: cellValue,
      explanation: entity?.explanation || null
    });
    setModalOpen(true);
  };

  const handleAnnotationChange = (action, details) => {
    if (!data || !data.rows) return;
    console.log(`Annotation ${action}:`, details);
    if (action === 'update') {
      const updatedRows = data.rows.map(row => {
        if (row.idRow === details.rowId) {
          const updatedLinkedEntities = row.linked_entities.map(entity => {
            if (entity.idColumn === details.columnId) {
              const filteredCandidates = (entity.candidates || []).filter(c => c.id !== details.entity.id);
              const newCandidates = (Array.isArray(details.candidates) && details.candidates.length > 0)
                ? details.candidates
                : [details.entity, ...filteredCandidates];
              return {
                ...entity,
                candidates: newCandidates,
                explanation: details.explanation ?? entity.explanation ?? null
              };
            }
            return entity;
          });
          return {
            ...row,
            linked_entities: updatedLinkedEntities
          };
        }
        return row;
      });
      setData({
        ...data,
        rows: updatedRows
      });
    } else if (action === 'delete') {
      const { rowId, columnId, entityId } = details;
      if (rowId === undefined || columnId === undefined || !entityId) {
        console.error('Invalid details for deletion:', details);
        return;
      }
      const updatedRows = data.rows.map(row => {
        if (row.idRow === rowId) {
          if (!row.linked_entities) return row;
          const updatedLinkedEntities = row.linked_entities.map(entity => {
            if (entity.idColumn === columnId) {
              const updatedCandidates = entity.candidates.filter(c => c.id !== entityId);
              if (updatedCandidates.length === 0) {
                return null;
              }
              return {
                ...entity,
                candidates: updatedCandidates
              };
            }
            return entity;
          }).filter(Boolean);
          return {
            ...row,
            linked_entities: updatedLinkedEntities
          };
        }
        return row;
      });
      setData({
        ...data,
        rows: updatedRows
      });
    }
  };

  const hasActiveFilters = searchText || 
    searchColumns?.length > 0 || 
    activeFilters.includeTypes?.length > 0 || 
    activeFilters.excludeTypes?.length > 0 ||
    sortParams.sortBy;

  const renderProgressBar = () => {
    if (!progressInfo || progressInfo.status === 'DONE') return null;

    const phaseLabel =
      progressInfo.phase === "PREDICTION"
        ? "Prediction Phase Progress"
        : progressInfo.phase === "ML_PREDICTION"
        ? "ML Prediction Phase Progress"
        : "Processing Progress";

    return (
      <Box sx={{ ml: 2, flexGrow: 1, maxWidth: 300 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="caption">{phaseLabel}</Typography>
          <Typography variant="caption">
            {progressInfo.completed_rows} / {progressInfo.total_rows} rows ({progressInfo.completion_percentage}%)
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={progressInfo.completion_percentage}
          sx={{ height: 8, borderRadius: 2 }}
        />
      </Box>
    );
  };

  if (loading && !data) {
    return (
      <Card sx={{ m: 2, overflow: 'hidden' }}>
        <CardHeader
          title={<Skeleton width="60%" height={40} />}
          subheader={<Skeleton width="40%" height={24} />}
        />
        <Divider />
        <CardContent>
          <Box sx={{ height: 400 }}>
            <Skeleton variant="rectangular" height={400} />
          </Box>
        </CardContent>
      </Card>
    );
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

  const hasEntity = data.rows.some(row => row.linked_entities && row.linked_entities.length > 0);

  // Add null check for the classified object to avoid errors
  const classified = data.classified_columns || { NE: {}, LIT: {} };
  const columnTypes = data.header.map((_, idx) =>
    classified && classified.NE && classified.NE.hasOwnProperty(idx) ? 'NE'
    : classified && classified.LIT && classified.LIT.hasOwnProperty(idx) ? 'LIT'
    : ''
  );
  const rawColumnTypes = data?.column_types || {};
  const ctaData = data?.header.map((_, idx) => rawColumnTypes[idx]?.types || []);
  const columnDefinitions = data?.header?.map((headerName, idx) => ({
    index: idx,
    name: headerName,
    type: columnTypes[idx] || ''
  })) || [];

  return (
    <Box sx={{ m: 2 }}>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <Button color="inherit" onClick={() => navigate('/dataset')} sx={{ cursor: 'pointer', textTransform: 'none', padding: 0, minWidth: 0,  fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit', textDecoration: 'underline',  '&:hover': {
        textDecoration: 'underline',
      }, }}>
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
          title={
            <Typography variant="h5" component="div">
              {tableName}
            </Typography>
          }
          subheader={
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
              <Typography variant="subtitle1" color="text.secondary" component="div">
                Dataset: {datasetName}
              </Typography>
              <Chip
                label={data?.status || 'Unknown'}
                size="small"
                color={
                  data?.status === 'DONE' ? 'success' :
                  data?.status === 'DOING' || data?.status === 'processing' ? 'warning' : 'default'
                }
                sx={{ ml: 2 }}
              />
              {(data?.status === 'DOING' || data?.status === 'processing') && (
                <CircularProgress size={16} sx={{ ml: 1 }} />
              )}
              
              {progressInfo && progressInfo.status !== 'DONE' && renderProgressBar()}
              
              {hasEntity && (
                <Box sx={{ ml: 2, display: 'flex', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                    Entity confidence:
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{ 
                      width: 12, 
                      height: 12, 
                      borderRadius: '50%', 
                      backgroundColor: '#388e3c', 
                      mr: 0.5 
                    }} />
                    <Typography variant="caption" sx={{ mr: 1 }}>High</Typography>
                    
                    <Box sx={{ 
                      width: 12, 
                      height: 12, 
                      borderRadius: '50%', 
                      backgroundColor: '#fbc02d', 
                      mr: 0.5 
                    }} />
                    <Typography variant="caption" sx={{ mr: 1 }}>Medium</Typography>
                    
                    <Box sx={{ 
                      width: 12, 
                      height: 12, 
                      borderRadius: '50%', 
                      backgroundColor: '#e64a19', 
                      mr: 0.5 
                    }} />
                    <Typography variant="caption">Low</Typography>
                  </Box>
                </Box>
              )}
              
              {hasActiveFilters && (
                <Chip
                  icon={<FilterIcon />}
                  label="Filters Active"
                  size="small"
                  color="secondary"
                  onDelete={handleClearFilters}
                  sx={{ ml: 2 }}
                />
              )}
            </Box>
          }
          action={
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Box component="span" sx={{ display: 'inline-flex', minWidth: 140 }}>
                <Button
                  variant="contained"
                  size="small"
                  color="primary"
                  startIcon={<AutoFixHighIcon />}
                  onClick={handleOpenLinkingDialog}
                  disabled={!data?.rows?.length || loading || (pendingLinkResults?.cells?.length ?? 0) > 0}
                  sx={{ width: '100%' }}
                >
                  Link entities
                </Button>
              </Box>
              <Tooltip title={data?.status !== 'DONE' ? 'Table is still processing...' : ''}>
                <Box component="span" sx={{ display: 'inline-flex', minWidth: 120 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<FileDownloadIcon />}
                    onClick={handleOpenExport}
                    disabled={data?.status !== 'DONE'}
                    sx={{ width: '100%' }}
                  >
                    Export CSV
                  </Button>
                </Box>
              </Tooltip>
              <Box component="span" sx={{ display: 'inline-flex', minWidth: 120 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={compact ? <FullscreenIcon /> : <CompressIcon />}
                  onClick={toggleCompact}
                  sx={{ width: '100%' }}
                >
                  {compact ? 'Expand View' : 'Compact View'}
                </Button>
              </Box>
            </Box>
          }
        />
        {pendingLinkResults?.cells?.length > 0 && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Alert
              severity="info"
              action={
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handlePersistLinkResults}
                    disabled={savingLinkResults}
                  >
                    {savingLinkResults
                      ? `Saving ${linkSaveProgress.completed}/${linkSaveProgress.total}`
                      : 'Save changes'}
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={handleDiscardLinkResults}
                    disabled={savingLinkResults}
                  >
                    Discard
                  </Button>
                </Box>
              }
            >
              {savingLinkResults
                ? 'Persisting entity suggestions...'
                : `${(pendingLinkResults.provider || 'Linking service').toUpperCase()} suggestions are ready for ${pendingLinkResults.cells.length} cell${pendingLinkResults.cells.length > 1 ? 's' : ''}.`}
              {savingLinkResults && (
                <LinearProgress sx={{ mt: 1 }} variant="determinate" value={
                  linkSaveProgress.total > 0
                    ? (linkSaveProgress.completed / linkSaveProgress.total) * 100
                    : 0
                } />
              )}
            </Alert>
            {linkSaveError && (
              <Alert
                severity="error"
                sx={{ mt: 1 }}
                onClose={() => setLinkSaveError(null)}
              >
                {linkSaveError}
              </Alert>
            )}
          </Box>
        )}

        {linkingError && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Alert
              severity="error"
              onClose={() => setLinkingError(null)}
            >
              {linkingError}
            </Alert>
          </Box>
        )}

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
          
          <TableSortControls
            headers={data?.header || []}
            columnTypes={columnTypes}
            onSort={handleSortChange}
            currentSortParams={sortParams}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={handleClearFilters}
          />
        </CardContent>
        
        <Divider />
        
        <CardContent sx={{ p: 0 }}>
          <TableContainer 
            component={Paper} 
            elevation={0}
            sx={{ 
              maxHeight: compact ? '60vh' : '70vh',
              width: '100%',
              overflow: 'auto',
              transition: 'max-height 0.3s ease',
              '&::-webkit-scrollbar': {
                width: '8px',
                height: '8px',
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: '#f1f1f1',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#888',
                borderRadius: '4px',
              },
            }}
          >
            <Table 
              stickyHeader 
              size={compact ? 'small' : 'medium'}
              sx={{ 
                minWidth: 650,
                tableLayout: 'auto',
              }}
            >
              <TableHead>
                <TableHeader
                  headers={data?.header || []}
                  sortableColumns={[]} 
                  sortColumn={null} 
                  sortOrder={null} 
                  handleSort={() => {}}
                  columnTypes={columnTypes}
                  ctaData={ctaData}
                  handleHeaderClick={(types, header, columnIndex) => {
                    handleColumnHeaderClick(columnIndex, header);
                  }}
                />
              </TableHead>
              
              <TableBody>
                {data?.rows?.length > 0 ? (
                  data.rows.map((row) => (
                    <TableRow 
                      key={row.idRow}
                      sx={{ 
                        '&:nth-of-type(odd)': { backgroundColor: '#fafafa' },
                        '&:hover': { backgroundColor: '#f1f7fd' },
                        transition: 'background-color 0.2s'
                      }}
                    >
                      {row.data.map((cell, colIndex) => {
                        const isNE = columnTypes[colIndex] === 'NE';
                        const entity = findEntityForCell(row.idRow, colIndex);
                        
                        return (
                          <TableCell 
                            key={colIndex}
                            onClick={isNE ? () => handleCellClick(row.idRow, colIndex, cell) : undefined}
                            sx={{ 
                              cursor: isNE ? 'pointer' : 'default',
                              minWidth: 100,
                              maxWidth: compact ? 200 : 300,
                              verticalAlign: 'top',
                              padding: compact ? '6px 10px' : '10px 16px',
                              fontSize: compact ? '0.75rem' : 'inherit',
                              '&:hover': {
                                backgroundColor: isNE ? 'rgba(0, 0, 0, 0.04)' : 'inherit'
                              }
                            }}
                          >
                            {entity ? (
                              <LinkedEntityCell 
                                value={cell}
                                entityData={entity}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCellClick(row.idRow, colIndex, cell);
                                }}
                                compact={compact}
                              />
                            ) : (
                              <TruncatedCell content={cell} maxLength={compact ? 100 : 150} compact={compact} />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={(data?.header || []).length} align="center" sx={{ py: 4 }}>
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
        
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          p: 2,
          borderTop: '1px solid rgba(0, 0, 0, 0.12)'
        }}>
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
          
          <Box>
            <Tooltip title={compact ? "Show more details" : "Compact view"}>
              <Button 
                variant="text" 
                size="small" 
                color="inherit"
                onClick={toggleCompact}
                endIcon={<KeyboardArrowDownIcon sx={{ 
                  transform: compact ? 'rotate(180deg)' : 'rotate(0)', 
                  transition: 'transform 0.3s' 
                }} />}
              >
                {compact ? "Expand" : "Compact"}
              </Button>
            </Tooltip>
          </Box>
        </Box>
      </Card>
      
      <EntityLinkingDialog
        open={linkingDialogOpen}
        onClose={() => setLinkingDialogOpen(false)}
        columns={columnDefinitions}
        rows={data?.rows || []}
        loading={linkingLoading}
        errorMessage={linkingError}
        onSubmit={handleStartLinking}
      />

      <TypeFilterModal
        open={typeFilterOpen}
        onClose={() => setTypeFilterOpen(false)}
        onApplyFilter={handleApplyFilter}
        columnIndex={selectedFilterColumn}
        columnName={data?.header?.[selectedFilterColumn] || `Column ${selectedFilterColumn}`}
        availableTypes={availableColumnTypes || []}
        loading={loading}
      />
      
      {modalOpen && modalData && (
        <EntityDetailsModal
          data={modalData.candidates}
          rowId={modalData.rowId}
          columnId={modalData.columnId}
          cellValue={modalData.cellValue}
          explanation={modalData.explanation}
          datasetName={datasetName}
          tableName={tableName}
          onAnnotationChange={handleAnnotationChange}
          onClose={() => {
            setModalOpen(false);
            setModalData(null);
          }}
        />
      )}

      {/* Export-fields dialog */}
      <Dialog open={openExportDialog} onClose={handleCloseExport}>
        <DialogTitle>Select annotation fields to include</DialogTitle>
        <DialogContent dividers>
          <FormGroup>
            {ANNOTATION_FIELDS.map(field => (
              <FormControlLabel
                key={field}
                control={
                  <Checkbox
                    checked={exportFields.includes(field)}
                    onChange={() => handleExportFieldToggle(field)}
                  />
                }
                label={field}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseExport}>Cancel</Button>
          <Button onClick={handleConfirmExport} variant="contained">
            Export
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TableDataViewer;
