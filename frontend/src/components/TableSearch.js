import React, { useState } from 'react';
import { Paper, TextField, InputAdornment, IconButton, Button, Tooltip, Box } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

const TableSearch = ({ 
  onSearch, 
  loading = false,
  initialSearchText = '',
  compact = false,
  noPaper = false
}) => {
  const [searchText, setSearchText] = useState(initialSearchText);

  const handleSearchChange = (e) => {
    setSearchText(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchText('');
    onSearch('');
  };

  const handleSubmitSearch = (e) => {
    e.preventDefault();
    onSearch(searchText);
  };

  const content = (
    <Box
      sx={{
        p: compact ? 0.25 : 0.75
      }}
    >
      <form onSubmit={handleSubmitSearch}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <TextField
            fullWidth
            size="small"
            value={searchText}
            onChange={handleSearchChange}
            placeholder="Search rows..."
            variant="outlined"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
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
          <Tooltip title="Search">
            <span>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="small"
                disabled={loading}
                aria-label="search"
                startIcon={<SearchIcon fontSize="small" />}
                sx={{
                  textTransform: 'none',
                  minWidth: compact ? 68 : 86,
                  minHeight: compact ? 30 : 32,
                  px: compact ? 1 : 1.2,
                  whiteSpace: 'nowrap'
                }}
              >
                Search
              </Button>
            </span>
          </Tooltip>
          {searchText && (
            <Tooltip title="Clear search">
              <IconButton onClick={handleClearSearch} color="default" size="small">
                <ClearIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </form>
    </Box>
  );

  if (noPaper) {
    return content;
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: compact ? 0.5 : 0.75,
        borderColor: '#e3e8f0'
      }}
    >
      {content}
    </Paper>
  );
};

export default TableSearch;
