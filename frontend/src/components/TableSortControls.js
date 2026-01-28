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
  scoreColumnName,
  onSort, 
  currentSortParams = {},
  hasActiveFilters = false,
  onClearFilters
}) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [sortType, setSortType] = useState(currentSortParams.sortBy || '');
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
    setSortDirection('desc');
    onSort({ sortBy: null, sortDirection: null });
    handleClose();
  };

  const handleSortTypeChange = (event) => {
    setSortType(event.target.value);
  };

  const handleDirectionChange = (direction) => {
    setSortDirection(direction);
  };

  const handleApplySort = () => {
    onSort({
      sortBy: sortType,
      sortDirection: sortDirection
    });
    handleClose();
  };

  const getSortDescription = () => {
    if (!currentSortParams.sortBy) return null;
    
    if (currentSortParams.sortBy === 'score') {
      const label = scoreColumnName ? `"${scoreColumnName}"` : 'score column';
      return `Sorting by ${label} (${currentSortParams.sortDirection === 'desc' ? 'highest first' : 'lowest first'})`;
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
                currentSortParams.sortBy === 'score' ? 'Score' :
                currentSortParams.sortBy === 'id' ? 'Row ID' :
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
          Sort Rows
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
                <MenuItem value="score" disabled={!scoreColumnName}>Score</MenuItem>
                <MenuItem value="id">Row ID</MenuItem>
              </Select>
              <FormHelperText>
                {sortType === 'score'
                  ? `Sort rows by the score column (${scoreColumnName || 'not available'})`
                  : sortType === 'id'
                  ? 'Sort rows by their original row order'
                  : 'Select a sort type'}
              </FormHelperText>
            </FormControl>
          </Grid>
          
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
              !sortType || (sortType === 'score' && !scoreColumnName)
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
