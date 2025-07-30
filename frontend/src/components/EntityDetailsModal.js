import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell, 
  TableHead, TableRow, Button, Link, TextField, CircularProgress, List, ListItem, 
  ListItemText, Typography, Checkbox, Box, Chip, IconButton,
  Tooltip, Paper, Tab, Tabs, InputAdornment, TableContainer, FormControl, 
  InputLabel, Select, MenuItem, Grid, Autocomplete, Alert, Fade
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { 
  fetchCandidates, 
  fetchEntityTypes, 
  updateAnnotation, 
  deleteAnnotation 
} from '../services/apiServices';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import DeleteIcon from '@mui/icons-material/Delete';

// Styled components
const StyledTableRow = styled(TableRow)(({ theme, isSelected }) => ({
  backgroundColor: isSelected ? 'rgba(25, 118, 210, 0.08)' : 'inherit',
  '&:hover': {
    backgroundColor: isSelected ? 'rgba(25, 118, 210, 0.12)' : 'rgba(0, 0, 0, 0.04)',
  },
  transition: 'background-color 0.2s'
}));

const ScoreChip = styled(Chip)(({ theme, score }) => {
  if (score === null || score === undefined) {
    return {
      backgroundColor: '#9e9e9e', // gray for missing scores
      color: 'white',
      fontWeight: 'bold',
      '& .MuiChip-label': {
        padding: '0 8px',
      }
    };
  }
  
  let color = '#e57373'; // red for low scores
  if (score > 0.8) color = '#81c784'; // green for high scores
  else if (score >= 0.5) color = '#fff176'; // yellow for medium scores
  
  return {
    backgroundColor: color,
    color: score > 0.5 ? 'rgba(0, 0, 0, 0.7)' : 'white',
    fontWeight: 'bold',
    '& .MuiChip-label': {
      padding: '0 8px',
    }
  };
});

const TypeChip = styled(Chip)(({ theme }) => ({
  margin: theme.spacing(0.5),
  backgroundColor: 'rgba(0, 0, 0, 0.08)',
  '&:hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.12)'
  }
}));

function EntityDetailsModal({ 
  data, 
  onClose, 
  rowId = null,
  columnId = null,
  cellValue = "",
  datasetName = null, 
  tableName = null,
  onAnnotationChange = null
}) {
  const [selectedWinnerIndex, setSelectedWinnerIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [checkedCandidates, setCheckedCandidates] = useState([]);
  const [currentTab, setCurrentTab] = useState(0);
  const [kind, setKind] = useState('');
  const [nerType, setNerType] = useState('');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [typeQuery, setTypeQuery] = useState('');
  const [typeOptions, setTypeOptions] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [entityBeingDeleted, setEntityBeingDeleted] = useState(null);
  const [localData, setLocalData] = useState([]);
  const [searchSelectedEntity, setSearchSelectedEntity] = useState(null);

  useEffect(() => {
    const matchIndex = data.findIndex(entity => entity.match);
    if (matchIndex !== -1) {
      setSelectedWinnerIndex(matchIndex);
    }
  }, [data]);

  useEffect(() => {
    setLocalData(data);
  }, [data]);

  useEffect(() => {
    const fetchData = async () => {
      if (query.length > 2) {
        setLoading(true);
        try {
          const searchOptions = { limit: 100 };
          if (kind) searchOptions.kind = kind;
          if (nerType) searchOptions.ner_type = nerType;
          if (selectedTypes.length > 0) {
            searchOptions.types = selectedTypes.map(type => type.id).join(' ');
          }
          const responseData = await fetchCandidates(query, searchOptions);
          setCandidates(responseData);
        } catch (err) {
          setError(err.message || 'Error fetching candidates');
        } finally {
          setLoading(false);
        }
      } else {
        setCandidates([]);
      }
    };

    const debounceFetch = setTimeout(fetchData, 300);
    return () => clearTimeout(debounceFetch);
  }, [query, kind, nerType, selectedTypes]);

  useEffect(() => {
    const fetchTypes = async () => {
      if (typeQuery.length > 2) {
        setLoadingTypes(true);
        try {
          const types = await fetchEntityTypes(typeQuery);
          setTypeOptions(types);
        } catch (err) {
          console.error('Error fetching types:', err);
        } finally {
          setLoadingTypes(false);
        }
      } else {
        setTypeOptions([]);
      }
    };

    const debounceFetch = setTimeout(fetchTypes, 300);
    return () => clearTimeout(debounceFetch);
  }, [typeQuery]);

  useEffect(() => {
    if (data.length === 0 && cellValue) {
      setQuery(cellValue);
      setCurrentTab(1); // Switch to search tab automatically
    }
  }, [data, cellValue]);

  useEffect(() => {
    if (currentTab !== 1) {
      setSearchSelectedEntity(null);
    }
  }, [currentTab]);

  const toggleWinner = (id) => {
    setSelectedWinnerIndex(id);
  };

  const handleCandidateCheck = (candidate) => {
    setCheckedCandidates((prevChecked) => {
      if (prevChecked.some(c => c.id === candidate.id)) {
        return prevChecked.filter((c) => c.id !== candidate.id);
      } else {
        return [...prevChecked, candidate];
      }
    });
  };

  const handleConfirmSelection = () => {
    const newCandidates = checkedCandidates.filter(
      (candidate) => !data.some((entity) => entity.id === candidate.id)
    );
    setSelectedCandidates(prev => [...prev, ...newCandidates]);
    setCheckedCandidates([]);
    setCandidates([]);
    setQuery('');
    setCurrentTab(0);
  };

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  const handleSaveAnnotation = async () => {
    if (rowId === null || rowId === undefined || 
        columnId === null || columnId === undefined || 
        !datasetName || !tableName) {
      setActionError('Missing required information for saving annotation');
      return;
    }

    setSavingAnnotation(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      let selectedEntity;
      
      if (currentTab === 0) {
        if (typeof selectedWinnerIndex === 'number') {
          selectedEntity = localData[selectedWinnerIndex];
        } else if (typeof selectedWinnerIndex === 'string' && selectedWinnerIndex.startsWith('added-')) {
          const addedIndex = parseInt(selectedWinnerIndex.replace('added-', ''));
          selectedEntity = selectedCandidates[addedIndex];
        }
      } else {
        selectedEntity = searchSelectedEntity;
      }

      if (!selectedEntity) {
        throw new Error('No entity selected');
      }

      await updateAnnotation(datasetName, tableName, rowId, columnId, selectedEntity);
      setActionSuccess('Annotation updated successfully');
      
      // Update the selected entity with a score of 1 before updating localData
      const topEntity = {
        ...selectedEntity,
        score: 1,  // Ensure top entity has score of 1
        match: true // Mark it as the matching entity
      };
      
      // Create updated local data with the selected entity at the top
      const updatedLocalData = [
        topEntity,
        ...localData.filter(e => e.id !== selectedEntity.id)
      ];
      
      setLocalData(updatedLocalData);
      setSelectedWinnerIndex(0);
      
      if (onAnnotationChange) {
        onAnnotationChange('update', { rowId, columnId, entity: topEntity });
      }
      
      if (currentTab === 1 && searchSelectedEntity) {
        const exists = localData.some(entity => entity.id === searchSelectedEntity.id) || 
                      selectedCandidates.some(entity => entity.id === searchSelectedEntity.id);
        
        if (!exists) {
          setSelectedCandidates(prev => [...prev, searchSelectedEntity]);
        }
        setCurrentTab(0);
      }

    } catch (error) {
      setActionError(`Failed to update annotation: ${error.message}`);
    } finally {
      setSavingAnnotation(false);
    }
  };

  const handleDeleteEntity = async (entity) => {
    if (!entity || !entity.id) {
      setActionError('Cannot delete: Invalid entity information');
      return;
    }
    
    if (rowId === null || rowId === undefined) {
      setActionError('Cannot delete: Missing row information');
      return;
    }
    
    if (columnId === null || columnId === undefined) {
      setActionError('Cannot delete: Missing column information');
      return;
    }
    
    if (!datasetName || !tableName) {
      setActionError('Cannot delete: Missing dataset or table information');
      return;
    }

    setEntityBeingDeleted(entity.id);
    setActionSuccess(null);
    setActionError(null);
    
    setLocalData(prevData => prevData.filter(e => e.id !== entity.id));

    try {
      await deleteAnnotation(datasetName, tableName, rowId, columnId, entity.id);
      setActionSuccess(`Entity ${entity.name || entity.id} deleted successfully`);
      
      if (onAnnotationChange) {
        onAnnotationChange('delete', { 
          rowId, 
          columnId, 
          entityId: entity.id 
        });
      }

      if ((typeof selectedWinnerIndex === 'number' && data[selectedWinnerIndex]?.id === entity.id)) {
        setSelectedWinnerIndex(null);
      }

      if (localData.length <= 1) {
        setCurrentTab(1);
      }
    } catch (error) {
      setLocalData(prevData => [...prevData, entity]);
      console.error('Delete entity error:', error);
      setActionError(`Failed to delete entity: ${error.message}`);
    } finally {
      setEntityBeingDeleted(null);
    }
  };

  const handleSelectSearchEntity = (entity) => {
    setSearchSelectedEntity(entity);
  };

  const renderEntityTable = () => (
    <Box>
      {localData.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No entities are associated with this cell.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setCurrentTab(1)}
            sx={{ mt: 2 }}
          >
            Search for entities
          </Button>
        </Box>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ mt: 2, maxHeight: 400, overflow: 'auto' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell width="5%">Rank</TableCell>
                <TableCell width="15%">QID</TableCell>
                <TableCell width="20%">Entity</TableCell>
                <TableCell width="20%">Description</TableCell>
                <TableCell width="18%">Types</TableCell>
                <TableCell width="10%">Score</TableCell>
                <TableCell width="12%">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {localData.map((entity, index) => (
                <StyledTableRow key={index} isSelected={selectedWinnerIndex === index}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    <Tooltip title="Open in Wikidata" arrow>
                      <Link 
                        href={`https://www.wikidata.org/wiki/${entity.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ display: 'flex', alignItems: 'center' }}
                      >
                        {entity.id}
                        <OpenInNewIcon fontSize="small" sx={{ ml: 0.5, fontSize: 14 }} />
                      </Link>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>{entity.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={entity.description || 'No description'} arrow>
                      <Typography variant="body2" sx={{ 
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {entity.description || 'No description'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                      {entity.types?.slice(0, 2).map(type => (
                        <TypeChip
                          key={type.id}
                          label={type.name}
                          size="small"
                          clickable
                          component="a"
                          href={`https://www.wikidata.org/wiki/${type.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      ))}
                      {entity.types?.length > 2 && (
                        <Tooltip title={entity.types.slice(2).map(t => t.name).join(', ')} arrow>
                          <TypeChip 
                            icon={<InfoIcon />} 
                            label={`+${entity.types.length - 2}`} 
                            size="small" 
                          />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <ScoreChip 
                      label={entity.score !== undefined && entity.score !== null ? entity.score.toFixed(2) : 'N/A'} 
                      size="small" 
                      score={entity.score} 
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => toggleWinner(index)}
                        sx={{ mr: 0.5 }}
                      >
                        {selectedWinnerIndex === index ? 
                          <CheckCircleIcon color="primary" /> : 
                          <CheckCircleIcon color="disabled" />
                        }
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteEntity(entity)}
                        disabled={entityBeingDeleted === entity.id}
                        sx={{ ml: 0.5 }}
                      >
                        {entityBeingDeleted === entity.id ? 
                          <CircularProgress size={16} /> : 
                          <DeleteIcon fontSize="small" />
                        }
                      </IconButton>
                    </Box>
                  </TableCell>
                </StyledTableRow>
              ))}
              
              {selectedCandidates.length > 0 && (
                <>
                  <TableRow>
                    <TableCell colSpan={7} sx={{ backgroundColor: '#f5f5f5' }}>
                      <Typography variant="subtitle2">Added Candidates</Typography>
                    </TableCell>
                  </TableRow>
                  
                  {selectedCandidates.map((candidate, index) => (
                    <StyledTableRow 
                      key={`added-${index}`} 
                      isSelected={selectedWinnerIndex === `added-${index}`}
                    >
                      <TableCell>{localData.length + index + 1}</TableCell>
                      <TableCell>
                        <Tooltip title="Open in Wikidata" arrow>
                          <Link 
                            href={`https://www.wikidata.org/wiki/${candidate.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ display: 'flex', alignItems: 'center' }}
                          >
                            {candidate.id}
                            <OpenInNewIcon fontSize="small" sx={{ ml: 0.5, fontSize: 14 }} />
                          </Link>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap>{candidate.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap>
                          {candidate.description || 'No description'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                          {candidate.types?.slice(0, 2).map(type => (
                            <TypeChip
                              key={type.id}
                              label={type.name}
                              size="small"
                              clickable
                              component="a"
                              href={`https://www.wikidata.org/wiki/${type.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          ))}
                          {candidate.types?.length > 2 && (
                            <Tooltip title={candidate.types.slice(2).map(t => t.name).join(', ')} arrow>
                              <TypeChip 
                                icon={<InfoIcon />} 
                                label={`+${candidate.types.length - 2}`} 
                                size="small" 
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => toggleWinner(`added-${index}`)}
                        >
                          {selectedWinnerIndex === `added-${index}` ? 
                            <CheckCircleIcon color="primary" /> : 
                            <CheckCircleIcon color="disabled" />
                          }
                        </IconButton>
                      </TableCell>
                    </StyledTableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  const renderSearchResults = () => (
    <>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for entities..."
            variant="outlined"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: query && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setQuery('')}>
                    <CloseIcon />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </Grid>
        
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth variant="outlined" size="small">
            <InputLabel>Kind</InputLabel>
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              label="Kind"
            >
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="entity">Entity</MenuItem>
              <MenuItem value="type">Type</MenuItem>
              <MenuItem value="property">Property</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth variant="outlined" size="small">
            <InputLabel>NER Type</InputLabel>
            <Select
              value={nerType}
              onChange={(e) => setNerType(e.target.value)}
              label="NER Type"
            >
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="PERSON">Person</MenuItem>
              <MenuItem value="LOCATION">Location</MenuItem>
              <MenuItem value="ORGANIZATION">Organization</MenuItem>
              <MenuItem value="OTHER">Other</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        
        <Grid item xs={12} sm={4}>
          <Autocomplete
            multiple
            filterSelectedOptions
            options={typeOptions}
            getOptionLabel={(option) => `${option.name} (${option.id})`}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            loading={loadingTypes}
            value={selectedTypes}
            onChange={(event, newValue) => setSelectedTypes(newValue)}
            onInputChange={(event, newInputValue) => setTypeQuery(newInputValue)}
            renderOption={(props, option) => (
              <Tooltip 
                title={option.description || 'No description available'} 
                arrow 
                placement="right"
              >
                <li {...props}>
                  {option.name} ({option.id})
                </li>
              </Tooltip>
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  label={option.name}
                  size="small"
                  {...getTagProps({ index })}
                />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Entity Types"
                placeholder="Search types..."
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingTypes ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
        </Grid>
      </Grid>
      
      {loading && (
        <Box display="flex" justifyContent="center" my={2}>
          <CircularProgress size={32} />
        </Box>
      )}
      
      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 2 }}>
          {error}
        </Typography>
      )}
      
      {candidates.length > 0 ? (
        <>
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            Found {candidates.length} results
          </Typography>
          
          <List sx={{ mt: 2, mb: 2, maxHeight: 300, overflow: 'auto' }}>
            {candidates.map((candidate, index) => {
              const isAlreadyAdded = data.some(entity => entity.id === candidate.id);
              const isSelected = searchSelectedEntity?.id === candidate.id;
              
              return (
                <ListItem 
                  key={index}
                  sx={{
                    border: `1px solid ${isSelected ? '#2196f3' : '#eee'}`,
                    borderRadius: '4px',
                    mb: 1,
                    backgroundColor: isSelected ? 'rgba(33, 150, 243, 0.08)' : 'inherit',
                    '&:hover': {
                      backgroundColor: isSelected ? 'rgba(33, 150, 243, 0.12)' : 'rgba(0, 0, 0, 0.04)'
                    }
                  }}
                >
                  <Checkbox
                    checked={checkedCandidates.some(c => c.id === candidate.id)}
                    onChange={() => handleCandidateCheck(candidate)}
                    color="primary"
                  />
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Link 
                          href={`https://www.wikidata.org/wiki/${candidate.id}`} 
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ display: 'flex', alignItems: 'center', mr: 1 }}
                        >
                          {candidate.name}
                          <OpenInNewIcon fontSize="small" sx={{ ml: 0.5, fontSize: 14 }} />
                        </Link>
                        <Chip 
                          label={candidate.id} 
                          size="small" 
                          sx={{ ml: 1, backgroundColor: '#e3f2fd' }} 
                        />
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography variant="body2" color="text.secondary">
                          {candidate.description || 'No description'}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', mt: 1 }}>
                          {candidate.types?.map(type => (
                            <TypeChip
                              key={type.id}
                              label={type.name}
                              size="small"
                              clickable
                              component="a"
                              href={`https://www.wikidata.org/wiki/${type.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          ))}
                        </Box>
                      </>
                    }
                    onClick={() => handleSelectSearchEntity(candidate)}
                    sx={{ cursor: 'pointer' }}
                  />
                  
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {isAlreadyAdded && (
                      <Tooltip title="This entity already exists in the candidates list">
                        <Chip 
                          label="Already added" 
                          size="small" 
                          color="info" 
                          variant="outlined"
                          sx={{ mr: 1 }}
                        />
                      </Tooltip>
                    )}
                    
                    <Button
                      variant={isSelected ? "contained" : "outlined"}
                      color="primary"
                      size="small"
                      onClick={() => handleSelectSearchEntity(candidate)}
                      startIcon={isSelected ? <CheckCircleIcon /> : null}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                  </Box>
                </ListItem>
              );
            })}
          </List>
          
          {checkedCandidates.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleConfirmSelection}
                startIcon={<CheckCircleIcon />}
              >
                Add {checkedCandidates.length} {checkedCandidates.length === 1 ? 'Candidate' : 'Candidates'}
              </Button>
            </Box>
          )}
        </>
      ) : query.length > 2 && !loading ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
          No results found for "{query}"
        </Typography>
      ) : query.length <= 2 && !loading ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
          Type at least 3 characters to search
        </Typography>
      ) : null}
    </>
  );

  return (
    <Dialog 
      open={true} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f5f5f5',
          borderBottom: '1px solid #ddd',
          p: 2
        }}
      >
        <Box>
          <Typography variant="h6" component="span">Entity Annotation</Typography>
          {cellValue && (
            <Chip
              label={cellValue}
              size="medium"
              variant="outlined"
              color="primary"
              sx={{ 
                ml: 2,
                maxWidth: '50%',
                '& .MuiChip-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }
              }}
            />
          )}
        </Box>
        <IconButton 
          onClick={onClose} 
          size="small"
          aria-label="close"
          sx={{ 
            color: 'text.secondary', 
            '&:hover': { 
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
              color: 'text.primary'
            },
            transition: 'all 0.2s'
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={currentTab} 
          onChange={handleTabChange} 
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="Entity Results" />
          <Tab label="Search New Entities" />
        </Tabs>
      </Box>
      
      <DialogContent sx={{ p: 2 }}>
        {actionSuccess && (
          <Fade in={!!actionSuccess}>
            <Alert severity="success" sx={{ mb: 2 }}>
              {actionSuccess}
            </Alert>
          </Fade>
        )}
        
        {actionError && (
          <Fade in={!!actionError}>
            <Alert severity="error" sx={{ mb: 2 }}>
              {actionError}
            </Alert>
          </Fade>
        )}
        
        {currentTab === 0 ? renderEntityTable() : renderSearchResults()}
      </DialogContent>
      
      <DialogActions sx={{ 
        p: 2, 
        borderTop: '1px solid #ddd',
        display: 'flex',
        justifyContent: 'flex-end'
      }}>
        <Button 
          variant="outlined" 
          color="inherit"
          onClick={onClose}
          sx={{ mr: 1 }}
        >
          Cancel
        </Button>
        
        {rowId !== null && columnId !== null ? (
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleSaveAnnotation}
            disabled={savingAnnotation || 
              (currentTab === 0 && 
                typeof selectedWinnerIndex !== 'number' && 
                !selectedWinnerIndex?.toString().startsWith('added-')) ||
              (currentTab === 1 && !searchSelectedEntity)}
          >
            {savingAnnotation ? 'Saving...' : 'Save Selected Entity'}
          </Button>
        ) : (
          <Button 
            variant="contained" 
            color="primary" 
            onClick={onClose}
          >
            Close
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default EntityDetailsModal;