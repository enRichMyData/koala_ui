import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTables, deleteTable, uploadTable } from '../services/apiServices';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  CircularProgress,
  Pagination,
  Alert,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
} from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add'; // Icon for adding a new table

const TableList = () => {
  const { datasetName } = useParams();
  const [tables, setTables] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [file, setFile] = useState(null);
  const [kgReference, setKgReference] = useState('');

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

  const handleOpenDeleteDialog = (tableName) => {
    setSelectedTable(tableName);
    setOpenDeleteDialog(true);
  };

  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setSelectedTable(null);
  };

  const confirmDeleteTable = async () => {
    try {
      await deleteTable(datasetName, selectedTable);
      setTables(tables.filter((table) => table.tableName !== selectedTable));
    } catch (error) {
      console.error('Failed to delete table:', error);
      setError('Failed to delete table');
    } finally {
      handleCloseDeleteDialog();
    }
  };

  const handleOpenUploadDialog = () => {
    setOpenUploadDialog(true);
  };

  const handleCloseUploadDialog = () => {
    setOpenUploadDialog(false);
    setFile(null);
    setKgReference('');
  };

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleUploadTable = async (event) => {
    event.preventDefault();
    try {
      await uploadTable(datasetName, file, kgReference);
      // Refresh the table list after uploading
      const response = await getTables(datasetName, currentPage);
      setTables(response.data);
      setError('');
    } catch (error) {
      console.error('Failed to upload table:', error);
      setError('Failed to upload table');
    } finally {
      handleCloseUploadDialog();
    }
  };

  if (loading) {
    return <CircularProgress />;
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1000, bgcolor: 'background.paper', margin: 'auto', p: 2 }}>
      <Typography variant="h6" component="div">
        Tables in Dataset: {datasetName}
      </Typography>
      <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={handleOpenUploadDialog}>
        Upload New Table
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      <List>
        {tables.length > 0 ? (
          tables.map((table, index) => (
            <ListItem key={index} button component={Link} to={`/dataset/${encodeURIComponent(datasetName)}/table/${table.tableName}`}>
              <ListItemIcon>
                <TableChartIcon />
              </ListItemIcon>
              <ListItemText primary={table.tableName} />
              <ListItemSecondaryAction>
                <IconButton edge="end" aria-label="delete" onClick={() => handleOpenDeleteDialog(table.tableName)}>
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
      
      <Dialog open={openDeleteDialog} onClose={handleCloseDeleteDialog}>
        <DialogTitle>{"Confirm Delete"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the table "{selectedTable}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} color="primary">
            Cancel
          </Button>
          <Button onClick={confirmDeleteTable} color="secondary">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openUploadDialog} onClose={handleCloseUploadDialog}>
        <DialogTitle>Upload New Table</DialogTitle>
        <DialogContent>
          <form onSubmit={handleUploadTable}>
            <input type="file" onChange={handleFileChange} required />
            <DialogActions>
              <Button onClick={handleCloseUploadDialog} color="primary">
                Cancel
              </Button>
              <Button type="submit" color="primary">
                Upload
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default TableList;