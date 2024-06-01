import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getTableData } from '../services/apiServices';
import { CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, Box, Pagination } from '@mui/material';
import EntityDetailsModal from './EntityDetailsModal';

function TableDataViewer() {
    const { datasetName, tableName } = useParams();
    const [tableData, setTableData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [status, setStatus] = useState(''); // State to track the status of the table data
    const [modalOpen, setModalOpen] = useState(false);
    const [modalData, setModalData] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await getTableData(datasetName, tableName, currentPage);
                setTableData(response.data);
                setStatus(response.data.status); // Assuming status is part of your API response
                setTotalPages(response.pagination.totalPages);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const intervalId = status === 'DOING' ? setInterval(fetchData, 5000) : null;

        return () => {
            if (intervalId) clearInterval(intervalId); // Clean up the interval on component unmount or status change
        };
    }, [datasetName, tableName, currentPage, status]);

    const handleCellClick = (rowId, colId) => {
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
            {status === 'DOING' && (
                <Box sx={{ display: 'flex', alignItems: 'center', color: 'primary.main' }}>
                    <CircularProgress size={24} sx={{ mr: 2 }} />
                    <Typography variant="subtitle1">Processing table data...</Typography>
                </Box>
            )}
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
                                {row.data.map((cell, colIdx) => {
                                    const hasAnnotation = tableData.semanticAnnotations.cea.some(ann => ann.idRow === row.idRow && ann.idColumn === colIdx && ann.entity.length > 0);
                                    //console.log(hasAnnotation, row.idRow, colIdx, cell);
                                    console.log(tableData.semanticAnnotations.cea);
                                    return (
                                        <TableCell
                                            key={colIdx}
                                            onClick={hasAnnotation ? () => handleCellClick(row.idRow, colIdx) : undefined}
                                            style={{ backgroundColor: hasAnnotation ? '#f0f8ff' : 'inherit', cursor: hasAnnotation ? 'pointer' : 'inherit' }}
                                        >
                                            {cell}
                                        </TableCell>
                                    );
                                })}
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
