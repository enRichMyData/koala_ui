import React, { useEffect, useMemo, useState } from 'react';
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
  columnTypes = [],
  hasReconciliationScores = false,
  onSort, 
  currentSortParams = {},
  hasActiveFilters = false,
  onClearFilters,
  compact = false
}) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [sortType, setSortType] = useState(currentSortParams.sortBy || 'score_avg');
  const [sortDirection, setSortDirection] = useState(currentSortParams.sortDirection || 'desc');
  const [sortConfidenceColumn, setSortConfidenceColumn] = useState(
    currentSortParams.sortConfidenceColumn ?? ''
  );

  const neColumns = useMemo(
    () =>
      (headers || [])
        .map((header, idx) => ({ idx, header }))
        .filter((entry) => columnTypes?.[entry.idx] === 'NE'),
    [headers, columnTypes]
  );

  useEffect(() => {
    setSortType(currentSortParams.sortBy || 'score_avg');
    setSortDirection(currentSortParams.sortDirection || 'desc');
    setSortConfidenceColumn(currentSortParams.sortConfidenceColumn ?? '');
  }, [
    currentSortParams.sortBy,
    currentSortParams.sortDirection,
    currentSortParams.sortConfidenceColumn
  ]);

  const open = Boolean(anchorEl);
  
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleClearSort = () => {
    setSortType('score_avg');
    setSortDirection('desc');
    setSortConfidenceColumn('');
    onSort({
      sortBy: 'score_avg',
      sortDirection: 'desc',
      sortConfidenceColumn: null
    });
    handleClose();
  };

  const handleSortTypeChange = (event) => {
    const value = event.target.value;
    setSortType(value);
    if (value !== 'score') {
      setSortConfidenceColumn('');
    }
  };

  const handleDirectionChange = (direction) => {
    setSortDirection(direction);
  };

  const handleApplySort = () => {
    const sortBy = sortType || 'score_avg';
    const selectedColumn =
      sortBy === 'score' &&
      sortConfidenceColumn !== '' &&
      sortConfidenceColumn !== null &&
      sortConfidenceColumn !== undefined
        ? Number(sortConfidenceColumn)
        : null;
    onSort({
      sortBy,
      sortDirection: sortDirection,
      sortConfidenceColumn: selectedColumn
    });
    handleClose();
  };

  const getSortDescription = () => {
    if (currentSortParams.sortBy === 'score_avg' || !currentSortParams.sortBy) {
      return `Sorting by average confidence score across NE columns (${currentSortParams.sortDirection === 'desc' ? 'highest first' : 'lowest first'})`;
    }
    const selectedColumn = neColumns.find(
      (entry) => Number(entry.idx) === Number(currentSortParams.sortConfidenceColumn)
    );
    const scopeText = selectedColumn
      ? `"${selectedColumn.header}"`
      : 'selected NE column';
    return `Sorting by confidence score on ${scopeText} (${currentSortParams.sortDirection === 'desc' ? 'highest first' : 'lowest first'})`;
  };

  return (
    <Box
      sx={{
        mb: 0,
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 0.6,
        maxWidth: '100%'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.6,
          flexWrap: 'wrap'
        }}
      >
        <Button
          variant="outlined"
          startIcon={<SortIcon />}
          onClick={handleClick}
          size="small"
          color={currentSortParams.sortBy ? 'primary' : 'inherit'}
          sx={{ minHeight: 28, py: 0, px: 1, fontSize: '0.74rem', textTransform: 'none' }}
        >
          Sort rows
        </Button>
        
        <Tooltip title={getSortDescription()}>
          <Chip
            label={
              currentSortParams.sortBy === 'score' &&
              currentSortParams.sortConfidenceColumn !== null &&
              currentSortParams.sortConfidenceColumn !== undefined
                ? `Score: ${headers?.[currentSortParams.sortConfidenceColumn] || `Col ${currentSortParams.sortConfidenceColumn}`}`
                : 'Score: row avg'
            }
            size="small"
            color="primary"
            onDelete={handleClearSort}
            variant="outlined"
            sx={{ maxWidth: compact ? 190 : '100%' }}
          />
        </Tooltip>
      </Box>

      {hasActiveFilters && (
        <Button
          variant="outlined"
          color="secondary"
          size="small"
          startIcon={<FilterListOffIcon />}
          onClick={onClearFilters}
          sx={{ minHeight: 28, py: 0, px: 1, fontSize: '0.74rem', textTransform: 'none' }}
        >
          Clear Filters
        </Button>
      )}
      
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { width: 340, maxWidth: '92vw', p: 1 }
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
                <MenuItem value="score_avg" disabled={!hasReconciliationScores}>
                  Avg confidence score (row)
                </MenuItem>
                <MenuItem value="score" disabled={!hasReconciliationScores || neColumns.length === 0}>
                  Confidence score (column)
                </MenuItem>
              </Select>
              <FormHelperText>
                {sortType === 'score'
                  ? 'Sort using one NE column.'
                  : 'Sort using row average across NE columns.'}
              </FormHelperText>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <FormControl fullWidth size="small">
              <InputLabel id="sort-column-label">Column scope</InputLabel>
              <Select
                labelId="sort-column-label"
                value={sortConfidenceColumn}
                label="Column scope"
                onChange={(event) => setSortConfidenceColumn(event.target.value)}
                disabled={!hasReconciliationScores || sortType !== 'score'}
              >
                {neColumns.map((entry) => (
                  <MenuItem key={`sort-ne-col-${entry.idx}`} value={entry.idx}>
                    {entry.header}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {sortType === 'score'
                  ? 'Pick the NE column used for score sorting.'
                  : 'Column is used only for column-score sorting.'}
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
              !hasReconciliationScores ||
              (sortType === 'score' && (sortConfidenceColumn === '' || sortConfidenceColumn === null || sortConfidenceColumn === undefined))
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
