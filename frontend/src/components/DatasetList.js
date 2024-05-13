import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDatasets } from '../services/apiServices';
import { List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, IconButton, Typography, CircularProgress, Pagination, Alert, Box } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';


const DatasetList = () => {
  const [datasets, setDatasets] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);

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
      <List>
        {datasets.length > 0 ? (
          datasets.map((dataset, index) => (
            <ListItem key={index} button component={Link} to={`/dataset/${dataset.datasetName}`}>
              <ListItemIcon>
                <FolderIcon />
              </ListItemIcon>
              <ListItemText primary={dataset.datasetName} />
              <ListItemSecondaryAction>
                <IconButton edge="end" aria-label="delete">
                  <DeleteIcon /> {/* Placeholder for delete functionality */}
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
    </Box>
  );
};

export default DatasetList;
