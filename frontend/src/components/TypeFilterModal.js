import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Typography,
  Box,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  Divider
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FilterListIcon from '@mui/icons-material/FilterList';

const TypeFilterModal = ({
  open,
  onClose,
  onApplyFilter,
  columnName,
  availableTypes = [],
  loading = false
}) => {
  const [filterMode, setFilterMode] = useState('include');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredTypes, setFilteredTypes] = useState(availableTypes);

  useEffect(() => {
    setFilteredTypes(availableTypes);
  }, [availableTypes]);

  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = availableTypes.filter(type => 
        type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        type.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredTypes(filtered);
    } else {
      setFilteredTypes(availableTypes);
    }
  }, [searchTerm, availableTypes]);

  const handleFilterModeChange = (e) => {
    setFilterMode(e.target.value);
  };

  const handleTypeToggle = (type) => {
    setSelectedTypes(prev => {
      if (prev.some(t => t.id === type.id)) {
        return prev.filter(t => t.id !== type.id);
      } else {
        return [...prev, type];
      }
    });
  };

  const handleApplyFilter = () => {
    const typeIds = selectedTypes.map(type => type.id);
    if (filterMode === 'include') {
      onApplyFilter({
        includeTypes: typeIds,
        excludeTypes: []
      });
    } else {
      onApplyFilter({
        includeTypes: [],
        excludeTypes: typeIds
      });
    }
    onClose();
  };

  const handleClearFilters = () => {
    setSelectedTypes([]);
    setSearchTerm('');
  };

  const handleClearAndClose = () => {
    onApplyFilter({
      includeTypes: [],
      excludeTypes: []
    });
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #e0e0e0',
        pb: 2
      }}>
        <Box>
          <Typography variant="h6">
            {filterMode === 'include' ? 'Include' : 'Exclude'} Semantic Types
          </Typography>
          {columnName && (
            <Typography variant="subtitle1" color="text.secondary">
              Scope: {columnName || 'All columns'}
            </Typography>
          )}
        </Box>
        <Chip 
          icon={<FilterListIcon fontSize="small" />} 
          label={`${selectedTypes.length} selected`}
          size="medium"
          color={selectedTypes.length > 0 ? "primary" : "default"}
        />
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3 }}>
        <Box sx={{ mb: 3 }}>
          <FormControl component="fieldset">
            <FormLabel component="legend">Filter Mode</FormLabel>
            <RadioGroup
              row
              value={filterMode}
              onChange={handleFilterModeChange}
            >
              <FormControlLabel 
                value="include" 
                control={<Radio />} 
                label={
                  <Typography variant="body2">
                    Include rows that contain these types
                    <Typography variant="caption" display="block" color="text.secondary">
                      (Types come from KG entities on NE columns)
                    </Typography>
                  </Typography>
                } 
              />
              <FormControlLabel 
                value="exclude" 
                control={<Radio />} 
                label={
                  <Typography variant="body2">
                    Exclude rows that contain these types
                    <Typography variant="caption" display="block" color="text.secondary">
                      (Types come from KG entities on NE columns)
                    </Typography>
                  </Typography>
                } 
              />
            </RadioGroup>
          </FormControl>
        </Box>
        
        <Divider sx={{ my: 2 }} />
        
        <TextField
          fullWidth
          placeholder="Search types..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          variant="outlined"
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searchTerm ? (
              <InputAdornment position="end">
                <IconButton
                  aria-label="clear search"
                  onClick={() => setSearchTerm('')}
                  edge="end"
                  size="small"
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null
          }}
        />
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : filteredTypes.length > 0 ? (
          <List sx={{ 
            maxHeight: '400px', 
            overflow: 'auto',
            border: '1px solid #e0e0e0',
            borderRadius: 1,
            bgcolor: '#fafafa'
          }}>
            {filteredTypes.map((type) => {
              const isSelected = selectedTypes.some(t => t.id === type.id);
              return (
                <ListItem
                  key={type.id}
                  dense
                  button
                  onClick={() => handleTypeToggle(type)}
                  sx={{
                    borderBottom: '1px solid #f0f0f0',
                    bgcolor: isSelected ? 'rgba(25, 118, 210, 0.08)' : 'inherit',
                    '&:hover': {
                      bgcolor: isSelected ? 'rgba(25, 118, 210, 0.12)' : 'rgba(0, 0, 0, 0.04)'
                    }
                  }}
                >
                  <ListItemIcon>
                    <Checkbox
                      edge="start"
                      checked={isSelected}
                      tabIndex={-1}
                      disableRipple
                      color="primary"
                    />
                  </ListItemIcon>
                  <ListItemText 
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body1">{type.name}</Typography>
                        <Chip 
                          size="small"
                          label={type.id}
                          sx={{ ml: 1, backgroundColor: '#e3f2fd' }}
                        />
                        {type.frequency && (
                          <Chip
                            size="small"
                            label={`${(type.frequency * 100).toFixed(1)}%`}
                            sx={{ ml: 1 }}
                            color={type.frequency > 0.5 ? "success" : "default"}
                          />
                        )}
                        <Box sx={{ ml: 'auto' }} />
                      </Box>
                    } 
                    secondary={type.description}
                  />
                </ListItem>
              );
            })}
          </List>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <Typography color="text.secondary">
              {searchTerm ? 'No types found matching your search' : 'No types available for this column'}
            </Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Box>
          <Button onClick={handleClearFilters} color="inherit" disabled={selectedTypes.length === 0}>
            Clear Selection
          </Button>
          <Button onClick={handleClearAndClose} color="inherit">
            Reset All Filters
          </Button>
        </Box>
        <Box>
          <Button onClick={onClose} color="inherit" sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button 
            onClick={handleApplyFilter} 
            variant="contained" 
            color="primary"
            disabled={selectedTypes.length === 0}
            startIcon={<FilterListIcon />}
          >
            Apply Filter
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default TypeFilterModal;
