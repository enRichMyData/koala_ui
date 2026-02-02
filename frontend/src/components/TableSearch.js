import React, { useState } from 'react';
import {
  Paper,
  TextField,
  InputAdornment,
  IconButton,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Button,
  Tooltip,
  Collapse,
  Box,
  Typography,
  Chip,
  Divider,
  Grid
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

const TableSearch = ({ 
  headers = [], 
  onSearch, 
  loading = false,
  columnTypes = {},
  initialSearchText = '',
  initialSearchColumns = []
}) => {
  const [searchText, setSearchText] = useState(initialSearchText);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState(initialSearchColumns || []);

  const handleSearchChange = (e) => {
    setSearchText(e.target.value);
  };

  const handleColumnToggle = (colIndex) => {
    setSelectedColumns(prev => {
      if (prev.includes(colIndex)) {
        return prev.filter(idx => idx !== colIndex);
      } else {
        return [...prev, colIndex];
      }
    });
  };

  const handleClearSearch = () => {
    setSearchText('');
    setSelectedColumns([]);
    onSearch('', []);
  };

  const handleSubmitSearch = (e) => {
    e.preventDefault();
    onSearch(searchText, selectedColumns.length > 0 ? selectedColumns : null);
  };

  const toggleFilters = () => {
    setShowFilters(prev => !prev);
  };

  return (
    <Paper sx={{ p: 1, mb: 1 }}>
      <form onSubmit={handleSubmitSearch}>
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={12} md={8}>
            <TextField
              fullWidth
              label="Search table content"
              size="small"
              value={searchText}
              onChange={handleSearchChange}
              placeholder="Enter text to search across rows..."
              variant="outlined"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchText ? (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="clear search"
                      onClick={() => setSearchText('')}
                      edge="end"
                      size="small"
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null
              }}
            />
          </Grid>
          
          <Grid item xs={6} md={2}>
            <Button
              fullWidth
              onClick={toggleFilters}
              startIcon={showFilters ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              variant="outlined"
              color="primary"
              size="small"
              sx={{ minHeight: 32, py: 0, px: 1, fontSize: '0.76rem', textTransform: 'none' }}
            >
              {showFilters ? 'Hide columns' : 'Columns'}
            </Button>
          </Grid>
          
          <Grid item xs={6} md={2}>
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
              <Tooltip title="Search">
              <Button 
                type="submit" 
                variant="contained" 
                color="primary"
                size="small"
                disabled={loading}
                aria-label="search"
                sx={{ minWidth: 36, width: 36, height: 32, p: 0 }}
              >
                <SearchIcon fontSize="small" />
              </Button>
              </Tooltip>
              {(searchText || selectedColumns.length > 0) && (
                <Tooltip title="Clear search">
                  <IconButton onClick={handleClearSearch} color="default" size="small">
                    <ClearIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Grid>
          
          {selectedColumns.length > 0 && (
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mr: 1, alignSelf: 'center' }}>
                  Searching in:
                </Typography>
                {selectedColumns.map(colIdx => (
                  <Chip 
                    key={colIdx}
                    label={headers[colIdx] || `Column ${colIdx}`}
                    size="small"
                    onDelete={() => handleColumnToggle(colIdx)}
                    color="primary"
                    variant="outlined"
                  />
                ))}
              </Box>
            </Grid>
          )}
        </Grid>
        
        <Collapse in={showFilters}>
          <Divider sx={{ my: 2 }} />
          <FormControl component="fieldset" sx={{ width: '100%' }}>
            <FormLabel component="legend">Select columns to search</FormLabel>
            <FormGroup row>
              {headers.map((header, index) => {
                const isNE = columnTypes[index] === 'NE';
                return (
                  <FormControlLabel
                    key={index}
                    control={
                      <Checkbox
                        checked={selectedColumns.includes(index)}
                        onChange={() => handleColumnToggle(index)}
                        size="small"
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body2">{header}</Typography>
                        {isNE && (
                          <Chip
                            label="NE"
                            size="small"
                            sx={{ ml: 0.5, height: 16, fontSize: '0.6rem', bgcolor: '#e8f5e9' }}
                          />
                        )}
                      </Box>
                    }
                    sx={{ 
                      minWidth: '120px', 
                      m: 0.5,
                      border: '1px solid #eee',
                      borderRadius: 1,
                      px: 1
                    }}
                  />
                );
              })}
            </FormGroup>
          </FormControl>
        </Collapse>
      </form>
    </Paper>
  );
};

export default TableSearch;
