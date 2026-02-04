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

const DEFAULT_SORT_PARAMS = {
  sortBy: 'id',
  sortDirection: 'asc',
  sortConfidenceColumn: null
};

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
  const [sortType, setSortType] = useState(currentSortParams.sortBy || DEFAULT_SORT_PARAMS.sortBy);
  const [sortDirection, setSortDirection] = useState(currentSortParams.sortDirection || DEFAULT_SORT_PARAMS.sortDirection);
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
    setSortType(currentSortParams.sortBy || DEFAULT_SORT_PARAMS.sortBy);
    setSortDirection(currentSortParams.sortDirection || DEFAULT_SORT_PARAMS.sortDirection);
    setSortConfidenceColumn(currentSortParams.sortConfidenceColumn ?? '');
  }, [
    currentSortParams.sortBy,
    currentSortParams.sortDirection,
    currentSortParams.sortConfidenceColumn
  ]);

  const normalizedSortBy = currentSortParams.sortBy || DEFAULT_SORT_PARAMS.sortBy;
  const normalizedSortDirection = currentSortParams.sortDirection || DEFAULT_SORT_PARAMS.sortDirection;
  const normalizedSortConfidenceColumn = currentSortParams.sortConfidenceColumn ?? null;
  const isDefaultSort = (
    normalizedSortBy === DEFAULT_SORT_PARAMS.sortBy &&
    normalizedSortDirection === DEFAULT_SORT_PARAMS.sortDirection &&
    normalizedSortConfidenceColumn === DEFAULT_SORT_PARAMS.sortConfidenceColumn
  );

  const open = Boolean(anchorEl);
  
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleClearSort = () => {
    setSortType(DEFAULT_SORT_PARAMS.sortBy);
    setSortDirection(DEFAULT_SORT_PARAMS.sortDirection);
    setSortConfidenceColumn('');
    onSort(DEFAULT_SORT_PARAMS);
    handleClose();
  };

  const handleSortTypeChange = (event) => {
    const value = event.target.value;
    setSortType(value);
    if (value === 'id') {
      setSortDirection('asc');
    }
    if (value !== 'score') {
      setSortConfidenceColumn('');
    }
  };

  const handleDirectionChange = (direction) => {
    setSortDirection(direction);
  };

  const handleApplySort = () => {
    const sortBy = sortType || DEFAULT_SORT_PARAMS.sortBy;
    const selectedColumn =
      sortBy === 'score' &&
      sortConfidenceColumn !== '' &&
      sortConfidenceColumn !== null &&
      sortConfidenceColumn !== undefined
        ? Number(sortConfidenceColumn)
        : null;
    onSort({
      sortBy,
      sortDirection: sortDirection || (sortBy === 'id' ? 'asc' : 'desc'),
      sortConfidenceColumn: selectedColumn
    });
    handleClose();
  };

  const getSortDescription = () => {
    if (normalizedSortBy === 'id') {
      return `Sorting by row ID (${normalizedSortDirection === 'desc' ? 'highest first' : 'lowest first'})`;
    }
    if (normalizedSortBy === 'score_avg') {
      return `Sorting by average confidence score across NE columns (${normalizedSortDirection === 'desc' ? 'highest first' : 'lowest first'})`;
    }
    const selectedColumn = neColumns.find(
      (entry) => Number(entry.idx) === Number(currentSortParams.sortConfidenceColumn)
    );
    const scopeText = selectedColumn
      ? `"${selectedColumn.header}"`
      : 'selected NE column';
    return `Sorting by confidence score on ${scopeText} (${normalizedSortDirection === 'desc' ? 'highest first' : 'lowest first'})`;
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
          color={isDefaultSort ? 'inherit' : 'primary'}
          sx={{ minHeight: 28, py: 0, px: 1, fontSize: '0.74rem', textTransform: 'none' }}
        >
          Sort rows
        </Button>
        
        <Tooltip title={getSortDescription()}>
          <Chip
            label={
              normalizedSortBy === 'id'
                ? `Row ID: ${normalizedSortDirection}`
                : normalizedSortBy === 'score' &&
                  normalizedSortConfidenceColumn !== null &&
                  normalizedSortConfidenceColumn !== undefined
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
                <MenuItem value="id">
                  Row ID
                </MenuItem>
                <MenuItem value="score_avg" disabled={!hasReconciliationScores}>
                  Avg confidence score (row)
                </MenuItem>
                <MenuItem value="score" disabled={!hasReconciliationScores || neColumns.length === 0}>
                  Confidence score (column)
                </MenuItem>
              </Select>
              <FormHelperText>
                {sortType === 'id'
                  ? 'Default order: row ID ascending (0, 1, 2...).'
                  : sortType === 'score'
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
                  {sortType === 'id' ? 'Descending' : 'Highest First'}
                </Button>
                <Button
                  variant={sortDirection === 'asc' ? 'contained' : 'outlined'}
                  size="small"
                  startIcon={<ArrowUpwardIcon />}
                  onClick={() => handleDirectionChange('asc')}
                  sx={{ flexGrow: 1 }}
                >
                  {sortType === 'id' ? 'Ascending' : 'Lowest First'}
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
              (sortType === 'score_avg' && !hasReconciliationScores) ||
              (
                sortType === 'score' &&
                (
                  !hasReconciliationScores ||
                  sortConfidenceColumn === '' ||
                  sortConfidenceColumn === null ||
                  sortConfidenceColumn === undefined
                )
              )
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
