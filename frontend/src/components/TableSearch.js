import React, { useState } from 'react';
import { Paper, TextField, InputAdornment, IconButton, Button, Tooltip, Box, Grid } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

const TableSearch = ({ 
  onSearch, 
  loading = false,
  initialSearchText = ''
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

  return (
    <Paper sx={{ p: 1, mb: 1 }}>
      <form onSubmit={handleSubmitSearch}>
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={12} md={9}>
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

          <Grid item xs={12} md={3}>
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
              {searchText && (
                <Tooltip title="Clear search">
                  <IconButton onClick={handleClearSearch} color="default" size="small">
                    <ClearIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Grid>
        </Grid>
      </form>
    </Paper>
  );
};

export default TableSearch;
