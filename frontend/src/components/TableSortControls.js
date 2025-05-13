import React, { useState } from 'react';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Divider,
  Typography,
  Tooltip,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  FormHelperText,
  Chip
} from '@mui/material';
import SortIcon from '@mui/icons-material/Sort';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FilterListOffIcon from '@mui/icons-material/FilterListOff';

const TableSortControls = ({ 
  headers = [], 
  columnTypes,
  onSort, 
  currentSortParams = {},
  hasActiveFilters = false,
  onClearFilters
}) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [sortType, setSortType] = useState(currentSortParams.sortBy || '');
  const [sortColumn, setSortColumn] = useState(
    currentSortParams.column !== undefined ? currentSortParams.column : null
  );
  const [sortDirection, setSortDirection] = useState(currentSortParams.sortDirection || 'desc');

  const open = Boolean(anchorEl);
  
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleClearSort = () => {
    setSortType('');
    setSortColumn(null);
    setSortDirection('desc');
    onSort({ sortBy: null, column: null, sortDirection: null });
    handleClose();
  };

  const handleSortTypeChange = (event) => {
    setSortType(event.target.value);
  };

  const handleSortColumnChange = (event) => {
    setSortColumn(event.target.value);
  };

  const handleDirectionChange = (direction) => {
    setSortDirection(direction);
  };

  const handleApplySort = () => {
    const sortParams = {
      sortBy: sortType,
      sortDirection: sortDirection
    };
    
    // Only include column if sortType is 'confidence'
    if (sortType === 'confidence') {
      sortParams.column = sortColumn;
    }
    
    onSort(sortParams);
    handleClose();
  };

  // Filter headers to only include NE columns for column confidence sorting
  const neColumns = headers
    .map((header, index) => ({ header, index, isNE: columnTypes[index] === 'NE' }))
    .filter(col => col.isNE);

  const getSortDescription = () => {
    if (!currentSortParams.sortBy) return null;
    
    if (currentSortParams.sortBy === 'confidence_avg') {
      return `Sorting by average row confidence (${currentSortParams.sortDirection === 'desc' ? 'highest first' : 'lowest first'})`;
    }
    
    if (currentSortParams.sortBy === 'confidence' && currentSortParams.column !== undefined) {
      const columnName = headers[currentSortParams.column] || `Column ${currentSortParams.column}`;
      return `Sorting by confidence in column "${columnName}" (${currentSortParams.sortDirection === 'desc' ? 'highest first' : 'lowest first'})`;
    }
    
    return null;
  };

  return (
    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          variant="outlined"
          startIcon={<SortIcon />}
          onClick={handleClick}
          size="small"
          color={currentSortParams.sortBy ? 'primary' : 'inherit'}
        >
          Sort
        </Button>
        
        {currentSortParams.sortBy && (
          <Tooltip title={getSortDescription() || ''}>
            <Chip
              label={
                currentSortParams.sortBy === 'confidence_avg' ? 'Average Confidence' : 
                currentSortParams.sortBy === 'confidence' ? `Column Confidence` : 
                'Custom Sort'
              }
              size="small"
              color="primary"
              onDelete={handleClearSort}
              variant="outlined"
            />
          </Tooltip>
        )}
      </Box>
      
      {hasActiveFilters && (
        <Button
          variant="outlined"
          color="secondary"
          size="small"
          startIcon={<FilterListOffIcon />}
          onClick={onClearFilters}
        >
          Clear Filters
        </Button>
      )}
      
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { width: 350, maxWidth: '90vw', p: 1 }
        }}
      >
        <Typography variant="subtitle1" sx={{ p: 1, fontWeight: 500 }}>
          Sort by Confidence
        </Typography>
        
        <Grid container spacing={2} sx={{ p: 1 }}>
          <Grid item xs={12}>
            <FormControl fullWidth size="small">
              <InputLabel id="sort-type-label">Sort Type</InputLabel>
              <Select
                labelId="sort-type-label"
                value={sortType}
                label="Sort Type"
                onChange={handleSortTypeChange}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                <MenuItem value="confidence_avg">Average Row Confidence</MenuItem>
                <MenuItem value="confidence">Column Confidence</MenuItem>
              </Select>
              <FormHelperText>
                {sortType === 'confidence_avg' ? 'Sort rows by their average confidence score across all entities' : 
                 sortType === 'confidence' ? 'Sort rows by confidence score in a specific column' : 
                 'Select a sort type'}
              </FormHelperText>
            </FormControl>
          </Grid>
          
          {sortType === 'confidence' && (
            <Grid item xs={12}>
              <FormControl fullWidth size="small" disabled={neColumns.length === 0}>
                <InputLabel id="sort-column-label">Column</InputLabel>
                <Select
                  labelId="sort-column-label"
                  value={sortColumn !== null ? sortColumn : ''}
                  label="Column"
                  onChange={handleSortColumnChange}
                >
                  {neColumns.length === 0 ? (
                    <MenuItem value="" disabled>No entity columns available</MenuItem>
                  ) : (
                    neColumns.map(col => (
                      <MenuItem key={col.index} value={col.index}>
                        {col.header || `Column ${col.index}`}
                      </MenuItem>
                    ))
                  )}
                </Select>
                <FormHelperText>
                  {neColumns.length === 0 ? 
                    'No entity columns found in this table' : 
                    'Select a column with named entities'}
                </FormHelperText>
              </FormControl>
            </Grid>
          )}
          
          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ p: 1 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>Sort Direction:</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant={sortDirection === 'desc' ? 'contained' : 'outlined'}
                  size="small"
                  startIcon={<ArrowDownwardIcon />}
                  onClick={() => handleDirectionChange('desc')}
                  sx={{ flexGrow: 1 }}
                >
                  Highest First
                </Button>
                <Button
                  variant={sortDirection === 'asc' ? 'contained' : 'outlined'}
                  size="small"
                  startIcon={<ArrowUpwardIcon />}
                  onClick={() => handleDirectionChange('asc')}
                  sx={{ flexGrow: 1 }}
                >
                  Lowest First
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>
        
        <Divider sx={{ my: 1 }} />
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1 }}>
          <Button 
            onClick={handleClearSort} 
            color="inherit"
            startIcon={<RestartAltIcon />}
            size="small"
          >
            Reset
          </Button>
          <Button 
            onClick={handleApplySort} 
            color="primary" 
            variant="contained"
            size="small"
            disabled={
              !sortType || 
              (sortType === 'confidence' && (sortColumn === null || sortColumn === undefined))
            }
          >
            Apply Sort
          </Button>
        </Box>
      </Menu>
    </Box>
  );
};

export default TableSortControls;
