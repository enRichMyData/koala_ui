import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell, 
  TableHead, TableRow, Button, Link, TextField, CircularProgress, List, ListItem, 
  ListItemText, Typography, Checkbox, Box, Chip, Avatar, IconButton, Divider,
  Tooltip, Paper, Tab, Tabs, InputAdornment, TableContainer
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { fetchCandidates } from '../services/apiServices';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';

// Styled components
const StyledTableRow = styled(TableRow)(({ theme, isSelected }) => ({
  backgroundColor: isSelected ? 'rgba(25, 118, 210, 0.08)' : 'inherit',
  '&:hover': {
    backgroundColor: isSelected ? 'rgba(25, 118, 210, 0.12)' : 'rgba(0, 0, 0, 0.04)',
  },
  transition: 'background-color 0.2s'
}));

const ScoreChip = styled(Chip)(({ theme, score }) => {
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

function EntityDetailsModal({ data, onClose }) {
  const [selectedWinnerIndex, setSelectedWinnerIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [checkedCandidates, setCheckedCandidates] = useState([]);
  const [currentTab, setCurrentTab] = useState(0);

  useEffect(() => {
    // Find if any entity is already marked as a match
    const matchIndex = data.findIndex(entity => entity.match);
    if (matchIndex !== -1) {
      setSelectedWinnerIndex(matchIndex);
    }
  }, [data]);

  useEffect(() => {
    const fetchData = async () => {
      if (query.length > 2) {
        setLoading(true);
        try {
          const responseData = await fetchCandidates(query);
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
  }, [query]);

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
    setSelectedCandidates(prev => [...prev, ...checkedCandidates]);
    setCheckedCandidates([]);
    setCandidates([]);
    setQuery('');
    setCurrentTab(1); // Switch to results tab after adding
  };

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  const renderEntityTable = () => (
    <TableContainer component={Paper} elevation={0} sx={{ mt: 2, maxHeight: 400, overflow: 'auto' }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell width="5%">Rank</TableCell>
            <TableCell width="15%">QID</TableCell>
            <TableCell width="20%">Entity</TableCell>
            <TableCell width="25%">Description</TableCell>
            <TableCell width="20%">Types</TableCell>
            <TableCell width="10%">Score</TableCell>
            <TableCell width="5%">Select</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((entity, index) => (
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
                  label={entity.score.toFixed(2)} 
                  size="small" 
                  score={entity.score} 
                />
              </TableCell>
              <TableCell>
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => toggleWinner(index)}
                >
                  {selectedWinnerIndex === index ? 
                    <CheckCircleIcon color="primary" /> : 
                    <CheckCircleIcon color="disabled" />
                  }
                </IconButton>
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
                  <TableCell>{data.length + index + 1}</TableCell>
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
  );

  const renderSearchResults = () => (
    <>
      <TextField
        fullWidth
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for entities..."
        variant="outlined"
        margin="normal"
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
          <List sx={{ mt: 2, mb: 2, maxHeight: 300, overflow: 'auto' }}>
            {candidates.map((candidate, index) => (
              <ListItem 
                key={index}
                sx={{
                  border: '1px solid #eee',
                  borderRadius: '4px',
                  mb: 1,
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)'
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
                        {candidate.description}
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
                />
              </ListItem>
            ))}
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
          borderRadius: '8px',
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderBottom: '1px solid #ddd'
      }}>
        <Typography variant="h6">Entity Details</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
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
        {currentTab === 0 ? renderEntityTable() : renderSearchResults()}
      </DialogContent>
      
      <DialogActions sx={{ 
        p: 2, 
        borderTop: '1px solid #ddd',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <Button 
          variant="outlined" 
          color="secondary" 
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button 
          variant="contained" 
          color="primary" 
          onClick={onClose}
        >
          Confirm Selection
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default EntityDetailsModal;