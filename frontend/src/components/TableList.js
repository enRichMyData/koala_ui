import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTables, deleteTable } from '../services/apiServices'; // Import deleteTable
import { List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, IconButton, Typography, CircularProgress, Pagination, Alert, Box, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';  // Icon representing tables
import DeleteIcon from '@mui/icons-material/Delete';  // Placeholder for delete functionality

const TableList = () => {
  const { datasetName } = useParams();
  const [tables, setTables] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);

  useEffect(() => {
    const fetchTables = async () => {
      setLoading(true);
      try {
        const encodedName = encodeURIComponent(datasetName);
        const response = await getTables(encodedName, currentPage);
        if (response.data && response.data.length > 0) {
          setTables(response.data);
          setTotalPages(response.pagination.totalPages);
          setCurrentPage(response.pagination.currentPage);
          setError('');
        } else {
          setTables([]);
          setError('No tables found for this dataset.');
        }
      } catch (error) {
        console.error('Failed to fetch tables:', error);
        setError('Failed to fetch tables');
      } finally {
        setLoading(false);
      }
    };

    fetchTables();
  }, [datasetName, currentPage]);

  const onPageChange = (event, page) => {
    setCurrentPage(page);
  };

  const handleOpenDialog = (tableName) => {
    setSelectedTable(tableName);
    setOpen(true);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setSelectedTable(null);
  };

  const confirmDeleteTable = async () => {
    if (!selectedTable) return;
    try {
      const encodedName = encodeURIComponent(datasetName);
      await deleteTable(encodedName, selectedTable);
      setTables(tables.filter(table => table.tableName !== selectedTable));
      setError('');
    } catch (error) {
      setError(`Failed to delete table: ${error.message}`);
    } finally {
      handleCloseDialog();
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
        Tables in Dataset: {datasetName}
      </Typography>
      <List>
        {tables.length > 0 ? (
          tables.map((table, index) => (
            <ListItem key={index} button component={Link} to={`/dataset/${encodeURIComponent(datasetName)}/table/${table.tableName}`}>
              <ListItemIcon>
                <TableChartIcon /> 
              </ListItemIcon>
              <ListItemText primary={table.tableName} />
              <ListItemSecondaryAction>
                <IconButton edge="end" aria-label="delete" onClick={() => handleOpenDialog(table.tableName)}>
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))
        ) : (
          <ListItem>
            <ListItemText primary="No tables found" />
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
            Are you sure you want to delete the table "{selectedTable}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="primary">
            Cancel
          </Button>
          <Button onClick={confirmDeleteTable} color="secondary">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TableList;