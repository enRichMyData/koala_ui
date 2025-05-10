import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTableData, getTableStatus } from '../services/apiServices';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, Tooltip, IconButton, Chip, Card, CardHeader, CardContent,
  Button, Divider, Skeleton, LinearProgress, Breadcrumbs, Link
} from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ReadMoreIcon from '@mui/icons-material/ReadMore';
import CompressIcon from '@mui/icons-material/Compress';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FilterIcon from '@mui/icons-material/FilterList';
import EntityDetailsModal from './EntityDetailsModal';
import TableHeader from './TableHeader';
import TableSearch from './TableSearch';
import TableSortControls from './TableSortControls';
import TypeFilterModal from './TypeFilterModal';

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
  const tooltipContent = `
    ${topCandidate.name} (${topCandidate.id})
    ${score !== null ? `Score: ${score.toFixed(2)}` : 'Score: N/A'}
    ${topCandidate.description || 'No description'}
    Types: ${topCandidate.types ? topCandidate.types.map(t => t.name).join(', ') : 'N/A'}
  `;

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

  // --- POLLING LOGIC STATE ---
  const [polling, setPolling] = useState(false);
  const pollingRef = React.useRef();

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
        setData(response.data);
        setNextCursor(response.pagination?.next_cursor || null);
        setPrevCursor(response.pagination?.prev_cursor || null);
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

  // --- POLLING EFFECT ---
  React.useEffect(() => {
    // Start polling if table is not DONE and data exists
    if (data && data.status !== 'DONE') {
      setPolling(true);
    } else {
      setPolling(false);
    }
  }, [data]);

  React.useEffect(() => {
    if (!polling) return;

    let cancelled = false;
    function poll() {
      pollingRef.current = setTimeout(async () => {
        if (cancelled) return;
        // Only poll if not DONE
        if (data && data.status !== 'DONE') {
          await fetchTableData();
        }
        if (!cancelled && data && data.status !== 'DONE') {
          poll();
        }
      }, 3000);
    }
    poll();

    return () => {
      cancelled = true;
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
    // eslint-disable-next-line
  }, [polling, fetchTableData, data]);

  useEffect(() => {
    let cancelled = false;
    setProgressInfo(null);

    // Only stream if table is not already DONE
    if (data?.status === 'DONE') {
      setProgressInfo(null);
      return;
    }

    getTableStatus(datasetName, tableName, (progress) => {
      if (!cancelled) {
        setProgressInfo(progress);
        if (progress?.status === 'DONE') {
          return;
        }
      }
    }).catch(() => {
      if (!cancelled) setProgressInfo(null);
    });

    return () => {
      cancelled = true;
    };
    // Only rerun if datasetName or tableName changes
    // eslint-disable-next-line
  }, [datasetName, tableName, data?.status]);

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
      cellValue: cellValue
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
              const filteredCandidates = entity.candidates.filter(c => c.id !== details.entity.id);
              return {
                ...entity,
                candidates: [details.entity, ...filteredCandidates]
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

  const classified = data.classified_columns || { NE: {}, LIT: {} };
  const columnTypes = data.header.map((_, idx) =>
    classified.NE.hasOwnProperty(idx) ? 'NE'
    : classified.LIT.hasOwnProperty(idx) ? 'LIT'
    : ''
  );
  const rawColumnTypes = data?.column_types || {};
  const ctaData = data?.header.map((_, idx) => rawColumnTypes[idx]?.types || []);

  return (
    <Box sx={{ m: 2 }}>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <Link color="inherit" onClick={() => navigate('/dataset')} sx={{ cursor: 'pointer' }}>
          Datasets
        </Link>
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
              
              {progressInfo && progressInfo.status !== 'DONE' && (
                <Box sx={{ ml: 2, flexGrow: 1, maxWidth: 300 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="caption">Processing progress</Typography>
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
              )}
              
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
            <Box sx={{ display: 'flex' }}>
              <Tooltip title={compact ? "Expand View" : "Compact View"}>
                <IconButton onClick={toggleCompact} size="small">
                  {compact ? <FullscreenIcon /> : <CompressIcon />}
                </IconButton>
              </Tooltip>
            </Box>
          }
        />
        
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
          datasetName={datasetName}
          tableName={tableName}
          onAnnotationChange={handleAnnotationChange}
          onClose={() => {
            setModalOpen(false);
            setModalData(null);
          }}
        />
      )}
    </Box>
  );
};

export default TableDataViewer;