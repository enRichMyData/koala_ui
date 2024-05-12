import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getTableData } from '../services/apiServices';
import { CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, Pagination } from '@mui/material';
import EntityDetailsModal from './EntityDetailsModal';

function TableDataViewer() {
    const { datasetName, tableName } = useParams();
    const [tableData, setTableData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalData, setModalData] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await getTableData(datasetName, tableName, currentPage);
                setTableData(response.data);
                setTotalPages(response.pagination.totalPages);
                setLoading(false);
                setError(null);
            } catch (err) {
                setError(err.message);
                setLoading(false);
            }
        };

        fetchData();
    }, [datasetName, tableName, currentPage]);

    const handleCellClick = (rowId, colId) => {
        // Finding the annotations for the clicked cell based on rowId and colId
        const annotations = tableData.semanticAnnotations.cea.filter(ann => ann.idRow === rowId && ann.idColumn === colId);
        if (annotations.length > 0) {
            setModalData(annotations[0].entity); // Assume the first matching entity is what we want to display
            setModalOpen(true);
        }
    };

    const handleModalClose = () => {
        setModalOpen(false);
        setModalData(null);
    };

    if (loading) return <CircularProgress />;
    if (error) return <Typography color="error">Error loading table data: {error}</Typography>;

    return (
        <Box sx={{ width: '100%', p: 2 }}>
            <Typography variant="h6" gutterBottom>
                Table Data: {tableName}
            </Typography>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            {tableData.header.map((header, index) => (
                                <TableCell key={index}>{header}</TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {tableData.rows.map((row, idx) => (
                            <TableRow key={idx}>
                                {row.data.map((cell, colIdx) => (
                                    <TableCell key={colIdx} onClick={() => handleCellClick(row.idRow, colIdx)}>
                                        {cell}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <Pagination count={totalPages} page={currentPage} onChange={(event, page) => setCurrentPage(page)} color="primary" sx={{ py: 2 }} />
            {modalOpen && <EntityDetailsModal data={modalData} onClose={handleModalClose} />}
        </Box>
    );
}

export default TableDataViewer;
