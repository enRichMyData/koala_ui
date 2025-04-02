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
import AddIcon from '@mui/icons-material/Add'; // Fixed import path
import FileUploadIcon from '@mui/icons-material/FileUpload';

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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);

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
          setNextCursor(response.pagination.next_cursor);
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
    setUploadProgress(0);
  };

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleUploadTable = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    try {
      setUploadProgress(10);
      await uploadTable(datasetName, file);
      setUploadProgress(100);
      
      // Refresh the table list after uploading
      const response = await getTables(datasetName, currentPage);
      setTables(response.data);
      setError('');
    } catch (error) {
      console.error('Failed to upload table:', error);
      setError('Failed to upload table: ' + (error.response?.data?.detail || error.message));
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
      <Button 
        variant="contained" 
        color="primary" 
        startIcon={<FileUploadIcon />} 
        onClick={handleOpenUploadDialog}
        sx={{ my: 2 }}
      >
        Upload New Table
      </Button>
      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
      <List>
        {tables.length > 0 ? (
          tables.map((table, index) => (
            <ListItem 
              key={index} 
              button 
              component={Link} 
              to={`/dataset/${encodeURIComponent(datasetName)}/table/${encodeURIComponent(table.tableName)}`}
              sx={{ 
                borderLeft: `4px solid ${
                  table.status === 'DONE' ? 'green' : 
                  table.status === 'processing' || table.status === 'DOING' ? 'orange' : 'grey'
                }`,
                mb: 1
              }}
            >
              <ListItemIcon>
                <TableChartIcon />
              </ListItemIcon>
              <ListItemText 
                primary={table.tableName} 
                secondary={
                  <>
                    <Typography component="span" variant="body2">
                      Rows: {table.totalRows} | Status: {table.status || 'Unknown'}
                    </Typography>
                    {table.createdAt && (
                      <Typography component="span" variant="body2" sx={{ ml: 2 }}>
                        Created: {new Date(table.createdAt).toLocaleString()}
                      </Typography>
                    )}
                  </>
                }
              />
              <ListItemSecondaryAction>
                <IconButton edge="end" aria-label="delete" onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOpenDeleteDialog(table.tableName);
                }}>
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
      <Pagination 
        count={totalPages} 
        page={currentPage} 
        onChange={onPageChange} 
        color="primary"
        disabled={!nextCursor && currentPage === 1}
      />
      
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
          <Button onClick={confirmDeleteTable} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openUploadDialog} onClose={handleCloseUploadDialog}>
        <DialogTitle>Upload New Table</DialogTitle>
        <DialogContent>
          <form onSubmit={handleUploadTable}>
            <Typography variant="body1" gutterBottom sx={{ mt: 2 }}>
              Select a CSV file to upload:
            </Typography>
            <input type="file" accept=".csv" onChange={handleFileChange} required />
            
            {uploadProgress > 0 && (
              <Box sx={{ width: '100%', mt: 2 }}>
                <Box sx={{ 
                  width: `${uploadProgress}%`, 
                  height: '4px', 
                  bgcolor: 'primary.main', 
                  transition: 'width 0.5s'
                }}/>
                <Typography variant="body2" align="center" sx={{ mt: 1 }}>
                  {uploadProgress < 100 ? 'Uploading...' : 'Upload complete!'}
                </Typography>
              </Box>
            )}
            
            <DialogActions>
              <Button onClick={handleCloseUploadDialog} color="secondary">
                Cancel
              </Button>
              <Button 
                type="submit" 
                color="primary" 
                variant="contained" 
                disabled={!file || uploadProgress > 0}
                startIcon={<FileUploadIcon />}
              >
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