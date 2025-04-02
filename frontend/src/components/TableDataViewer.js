import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getTableData } from '../services/apiServices';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, Tooltip, IconButton, Chip, Card, CardHeader, CardContent,
  Button, Divider, Skeleton, useTheme, useMediaQuery, Badge, Stack, Collapse, Fade
} from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ReadMoreIcon from '@mui/icons-material/ReadMore';
import CompressIcon from '@mui/icons-material/Compress';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import EntityDetailsModal from './EntityDetailsModal';

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
    if (score > 0.8) return '#a5d6a7'; // light green
    if (score >= 0.5) return '#fff59d'; // light yellow
    return '#ffab91'; // light red
  };

  const getScoreBorderColor = (score) => {
    if (score > 0.8) return '#388e3c'; // darker green
    if (score >= 0.5) return '#fbc02d'; // darker yellow
    return '#e64a19'; // darker red
  };

  if (!entityData?.candidates || entityData.candidates.length === 0) {
    return <TruncatedCell content={value} maxLength={150} compact={compact} />;
  }

  const topCandidate = entityData.candidates[0];
  const score = topCandidate.score;
  const tooltipContent = `
    ${topCandidate.name} (${topCandidate.id})
    Score: ${score.toFixed(2)}
    ${topCandidate.description || 'No description'}
    Types: ${topCandidate.types.map(t => t.name).join(', ')}
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
              label={score.toFixed(2)}
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
  const { datasetName, tableName } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationHistory, setPaginationHistory] = useState([{ page: 1, nextCursor: null, prevCursor: null }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [compact, setCompact] = useState(false);
  const [status, setStatus] = useState('loading');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Keep track of our pagination state
  const currentHistoryRef = useRef(paginationHistory[historyIndex]);
  useEffect(() => {
    currentHistoryRef.current = paginationHistory[historyIndex];
  }, [paginationHistory, historyIndex]);

  // Fetch table data with cursor
  const fetchTableData = useCallback(async () => {
    setLoading(true);
    
    try {
      const historyItem = currentHistoryRef.current;
      const options = {};
      
      if (historyItem.nextCursor) {
        options.nextCursor = historyItem.nextCursor;
      } else if (historyItem.prevCursor) {
        options.prevCursor = historyItem.prevCursor;
      }
      
      const response = await getTableData(datasetName, tableName, historyItem.page, 10, options);
      
      if (response.data) {
        setData(response.data);
        setStatus(response.data.status);
        
        // Update pagination history with new cursors if this was a forward request
        if (historyIndex === paginationHistory.length - 1) {
          setPaginationHistory(prev => [
            ...prev.slice(0, historyIndex + 1),
            { 
              page: historyItem.page + 1, 
              prevCursor: response.pagination.prev_cursor, 
              nextCursor: response.pagination.next_cursor
            }
          ]);
        }
      } else {
        setError('No data available');
      }
    } catch (err) {
      console.error('Error fetching table data:', err);
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  }, [datasetName, tableName, historyIndex, paginationHistory]);

  useEffect(() => {
    fetchTableData();
    
    // Polling if table is still processing
    const isProcessing = status === 'DOING' || status === 'TODO' || status === 'processing';
    const intervalId = isProcessing ? setInterval(fetchTableData, 5000) : null;
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchTableData, status]);

  const handleCellClick = (rowId, colId) => {
    if (!data || !data.rows) return;
    
    const row = data.rows.find(r => r.idRow === rowId);
    if (!row || !row.linked_entities) return;
    
    const entity = row.linked_entities.find(e => e.idColumn === colId);
    if (entity && entity.candidates && entity.candidates.length > 0) {
      setModalData(entity.candidates);
      setModalOpen(true);
    }
  };

  const handlePreviousPage = () => {
    // Go back in our history
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setCurrentPage(paginationHistory[historyIndex - 1].page);
    }
  };

  const handleNextPage = () => {
    // Go forward in our history if possible, otherwise fetch next page
    if (historyIndex < paginationHistory.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setCurrentPage(paginationHistory[historyIndex + 1].page);
    } else {
      // The next button should only be enabled if there's a next_cursor
      const currentItem = paginationHistory[historyIndex];
      if (currentItem.nextCursor) {
        setHistoryIndex(prev => prev + 1);
        setCurrentPage(prev => prev + 1);
      }
    }
  };

  const toggleCompact = () => {
    setCompact(!compact);
  };

  // Find linked entity for a cell
  const findEntityForCell = (rowId, colId) => {
    if (!data || !data.rows) return null;
    
    const row = data.rows.find(r => r.idRow === rowId);
    if (!row || !row.linked_entities) return null;
    
    return row.linked_entities.find(e => e.idColumn === colId);
  };

  // Loading skeleton
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

  // Error state
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

  // Empty state
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

  // Helper to check if we can go forward or backward
  const canGoForward = historyIndex < paginationHistory.length - 1 || 
                       paginationHistory[historyIndex].nextCursor;
  const canGoBackward = historyIndex > 0;
  
  const currentHistoryItem = paginationHistory[historyIndex];
  const hasEntity = data.rows.some(row => row.linked_entities && row.linked_entities.length > 0);

  return (
    <Box sx={{ m: 2 }}>
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
                label={data.status || 'Unknown'}
                size="small"
                color={
                  data.status === 'DONE' ? 'success' :
                  data.status === 'DOING' || data.status === 'processing' ? 'warning' : 'default'
                }
                sx={{ ml: 2 }}
              />
              {(data.status === 'DOING' || data.status === 'processing') && (
                <CircularProgress size={16} sx={{ ml: 1 }} />
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
                <TableRow>
                  {data.header.map((header, index) => (
                    <TableCell
                      key={index}
                      sx={{
                        fontWeight: 'bold',
                        backgroundColor: '#f5f5f5',
                        color: '#333',
                        whiteSpace: 'nowrap',
                        borderBottom: '2px solid #ddd',
                        textTransform: 'uppercase',
                        fontSize: compact ? '0.65rem' : '0.75rem',
                        letterSpacing: '0.5px',
                        padding: compact ? '8px 10px' : '12px 16px',
                        minWidth: 120,
                      }}
                    >
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow 
                    key={row.idRow}
                    sx={{ 
                      '&:nth-of-type(odd)': { backgroundColor: '#fafafa' },
                      '&:hover': { backgroundColor: '#f1f7fd' },
                      transition: 'background-color 0.2s'
                    }}
                  >
                    {row.data.map((cell, colIndex) => {
                      const entity = findEntityForCell(row.idRow, colIndex);
                      
                      return (
                        <TableCell 
                          key={colIndex}
                          sx={{ 
                            minWidth: 100,
                            maxWidth: compact ? 200 : 300,
                            verticalAlign: 'top',
                            padding: compact ? '6px 10px' : '10px 16px',
                            fontSize: compact ? '0.75rem' : 'inherit',
                          }}
                        >
                          {entity ? (
                            <LinkedEntityCell 
                              value={cell}
                              entityData={entity}
                              onClick={() => handleCellClick(row.idRow, colIndex)}
                              compact={compact}
                            />
                          ) : (
                            <TruncatedCell content={cell} maxLength={compact ? 100 : 150} compact={compact} />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
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
            {data.rows.length} rows displayed
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Button
              disabled={!canGoBackward}
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
              disabled={!canGoForward}
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
      
      {modalOpen && modalData && (
        <EntityDetailsModal
          data={modalData}
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