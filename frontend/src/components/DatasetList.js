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

const DatasetList = () => {
  const [datasets, setDatasets] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [newDatasetName, setNewDatasetName] = useState('');

  useEffect(() => {
    const fetchDatasets = async () => {
      setLoading(true);
      try {
        const response = await getDatasets(currentPage);
        setDatasets(response.data || []);
        setTotalPages(response.pagination.totalPages);
        setCurrentPage(response.pagination.currentPage);
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
    try {
      const newDataset = await createDataset(newDatasetName);
      setDatasets([...datasets, newDataset]);
      setNewDatasetName('');
      setError('');
    } catch (error) {
      setError(`Failed to create dataset: ${error.message}`);
    }
  };

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1000, bgcolor: 'background.paper', margin: 'auto', p: 2 }}>
      <Typography variant="h6" component="div">
        Dataset List
      </Typography>
      <form onSubmit={handleCreateDataset}>
        <TextField
          label="New Dataset Name"
          value={newDatasetName}
          onChange={(e) => setNewDatasetName(e.target.value)}
          required
          variant="outlined"
          fullWidth
          margin="normal"
        />
        <Button type="submit" variant="contained" color="primary">
          Create Dataset
        </Button>
      </form>
      <List>
        {datasets.length > 0 ? (
          datasets.map((dataset, index) => (
            <ListItem key={index} button component={Link} to={`/dataset/${dataset.datasetName}`}>
              <ListItemIcon>
                <FolderIcon />
              </ListItemIcon>
              <ListItemText primary={dataset.datasetName} />
              <ListItemSecondaryAction>
                <IconButton edge="end" aria-label="delete" onClick={() => handleOpenDialog(dataset.datasetName)}>
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
      <Pagination count={totalPages} page={currentPage} onChange={onPageChange} color="primary" />
      
      <Dialog
        open={open}
        onClose={handleCloseDialog}
      >
        <DialogTitle>{"Confirm Delete"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the dataset "{selectedDataset}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="primary">
            Cancel
          </Button>
          <Button onClick={confirmDeleteDataset} color="secondary">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DatasetList;