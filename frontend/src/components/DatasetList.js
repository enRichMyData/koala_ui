import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDatasets, deleteDataset, createDataset } from '../services/apiServices';
import { 
  List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, IconButton, 
  Typography, CircularProgress, Pagination, Alert, Box, Dialog, DialogActions, 
  DialogContent, DialogContentText, DialogTitle, Button, TextField 
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import AddCircleIcon from '@mui/icons-material/AddCircle';

const DatasetList = () => {
  const [datasets, setDatasets] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [nextCursor, setNextCursor] = useState(null);

  useEffect(() => {
    const fetchDatasets = async () => {
      setLoading(true);
      try {
        const response = await getDatasets(currentPage);
        setDatasets(response.data || []);
        setTotalPages(response.pagination.totalPages);
        setCurrentPage(response.pagination.currentPage);
        setNextCursor(response.pagination.next_cursor);
        setError('');
      } catch (error) {
        setError(`Failed to fetch datasets: ${error.message}`);
        setDatasets([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDatasets();
  }, [currentPage]);

  const onPageChange = (event, page) => {
    setCurrentPage(page);
  };

  const handleOpenDialog = (datasetName) => {
    setSelectedDataset(datasetName);
    setOpen(true);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setSelectedDataset(null);
  };

  const confirmDeleteDataset = async () => {
    if (!selectedDataset) return;
    try {
      await deleteDataset(selectedDataset);
      setDatasets(datasets.filter(dataset => dataset.datasetName !== selectedDataset));
      setError('');
    } catch (error) {
      setError(`Failed to delete dataset: ${error.message}`);
    } finally {
      handleCloseDialog();
    }
  };

  const handleCreateDataset = async (e) => {
    e.preventDefault();
    if (!newDatasetName.trim()) {
      setError('Dataset name cannot be empty');
      return;
    }
    
    try {
      const newDataset = await createDataset(newDatasetName);
      setDatasets([...datasets, {
        datasetName: newDataset.dataset_name,
        totalTables: 0,
        totalRows: 0,
        createdAt: newDataset.created_at
      }]);
      setNewDatasetName('');
      setError('');
    } catch (error) {
      setError(`Failed to create dataset: ${error.response?.data?.detail || error.message}`);
    }
  };

  if (loading) {
    return <CircularProgress />;
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1000, bgcolor: 'background.paper', margin: 'auto', p: 2 }}>
      <Typography variant="h6" component="div" gutterBottom>
        Dataset List
      </Typography>
      
      <Box sx={{ mb: 3, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
        <Typography variant="subtitle1" gutterBottom>
          Create New Dataset
        </Typography>
        <form onSubmit={handleCreateDataset} style={{ display: 'flex', alignItems: 'flex-end' }}>
          <TextField
            label="Dataset Name"
            value={newDatasetName}
            onChange={(e) => setNewDatasetName(e.target.value)}
            required
            variant="outlined"
            fullWidth
            size="small"
            sx={{ mr: 2 }}
          />
          <Button type="submit" variant="contained" color="primary" startIcon={<AddCircleIcon />}>
            Create
          </Button>
        </form>
      </Box>
      
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <List>
        {datasets.length > 0 ? (
          datasets.map((dataset, index) => (
            <ListItem 
              key={index} 
              button 
              component={Link} 
              to={`/dataset/${encodeURIComponent(dataset.datasetName)}`}
              sx={{ 
                mb: 1,
                borderLeft: '4px solid #3f51b5',
                '&:hover': {
                  bgcolor: '#f5f5f5'
                }
              }}
            >
              <ListItemIcon>
                <FolderIcon color="primary" />
              </ListItemIcon>
              <ListItemText 
                primary={dataset.datasetName} 
                secondary={
                  <>
                    <Typography component="span" variant="body2">
                      Tables: {dataset.totalTables} | Rows: {dataset.totalRows}
                    </Typography>
                    {dataset.createdAt && (
                      <Typography component="span" variant="body2" sx={{ ml: 2 }}>
                        Created: {new Date(dataset.createdAt).toLocaleString()}
                      </Typography>
                    )}
                  </>
                }
              />
              <ListItemSecondaryAction>
                <IconButton 
                  edge="end" 
                  aria-label="delete" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpenDialog(dataset.datasetName);
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))
        ) : (
          <ListItem>
            <ListItemText primary="No datasets found" />
          </ListItem>
        )}
      </List>
      
      <Pagination 
        count={totalPages} 
        page={currentPage} 
        onChange={onPageChange} 
        color="primary"
        disabled={!nextCursor && currentPage === 1}
      />
      
      <Dialog
        open={open}
        onClose={handleCloseDialog}
      >
        <DialogTitle>{"Confirm Delete"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the dataset "{selectedDataset}"? This action cannot be undone and will delete all associated tables.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="primary">
            Cancel
          </Button>
          <Button onClick={confirmDeleteDataset} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DatasetList;