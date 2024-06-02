import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getTableData } from '../services/apiServices';
import { CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, Box, Button, Pagination } from '@mui/material';
import EntityDetailsModal from './EntityDetailsModal';
import SortIcon from '@mui/icons-material/Sort';
import CompressIcon from '@mui/icons-material/Compress';
import ExpandIcon from '@mui/icons-material/Expand';

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
    const [sortColumn, setSortColumn] = useState(null);
    const [sortOrder, setSortOrder] = useState(null);
    const [sortableColumns, setSortableColumns] = useState([]);
    const [compact, setCompact] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await getTableData(datasetName, tableName, currentPage, 10, sortColumn, sortOrder);
                setTableData(response.data);
                setStatus(response.data.status); // Assuming status is part of your API response
                setTotalPages(response.pagination.totalPages);

                // Determine sortable columns
                const sortableCols = [];
                response.data.header.forEach((header, index) => {
                    if (response.data.semanticAnnotations.cea.some(ann => ann.idColumn === index && ann.entity.length > 0)) {
                        sortableCols.push(index);
                    }
                });
                console.log('Sortable columns:', sortableCols);
                setSortableColumns(sortableCols);

            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const intervalId = (status === 'DOING' || status === 'TODO') ? setInterval(fetchData, 5000) : null;

        return () => {
            if (intervalId) clearInterval(intervalId); // Clean up the interval on component unmount or status change
        };
    }, [datasetName, tableName, currentPage, status, sortColumn, sortOrder]);

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

    const handleSort = (column) => {
        if (sortableColumns.includes(column)) {
            const newSortOrder = sortColumn === column && sortOrder === 'asc' ? 'desc' : 'asc';
            setSortColumn(column);
            setSortOrder(newSortOrder);
        }
    };

    const resetSort = () => {
        setSortColumn(null);
        setSortOrder(null);
    };

    const toggleCompact = () => {
        setCompact(!compact);
    };

    const getCellColor = (confidenceScore) => {
        if (confidenceScore > 0.8) return 'green'; // Green
        if (confidenceScore >= 0.5) return 'yellow'; // Yellow
        return 'red'; // Red
    };

    if (loading) return <CircularProgress />;
    if (error) return <Typography color="error">Error loading table data: {error}</Typography>;

    return (
        <Box sx={{ width: '100%', p: 2 }}>
            <Typography variant="h6" gutterBottom>
                Table Data: {tableName}
            </Typography>
            {(status === 'TODO' || status === 'DOING') && (
                <Box sx={{ display: 'flex', alignItems: 'center', color: 'primary.main' }}>
                    <CircularProgress size={24} sx={{ mr: 2 }} />
                    <Typography variant="subtitle1">Processing table data...</Typography>
                </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                <Button onClick={toggleCompact} color="primary" startIcon={compact ? <ExpandIcon /> : <CompressIcon />}>
                    {compact ? 'Expand Table' : 'Compact Table'}
                </Button>
                <Button onClick={resetSort} color="primary" startIcon={<SortIcon />}>
                    Reset Sort
                </Button>
            </Box>
            <TableContainer component={Paper}>
                <Table size={compact ? 'small' : 'medium'}>
                    <TableHead>
                        <TableRow>
                            {tableData.header.map((header, index) => {
                                const isSortable = sortableColumns.includes(index);
                                return (
                                    <TableCell 
                                        key={index} 
                                        onClick={isSortable ? () => handleSort(index) : undefined}
                                        style={{ cursor: isSortable ? 'pointer' : 'default' }}
                                    >
                                        {header} {sortColumn === index && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {tableData.rows.map((row, idx) => (
                            <TableRow key={idx}>
                                {row.data.map((cell, colIdx) => {
                                    const hasAnnotation = tableData.semanticAnnotations.cea.some(ann => ann.idRow === row.idRow && ann.idColumn === colIdx && ann.entity.length > 0);
                                    const annotation = tableData.semanticAnnotations.cea.find(ann => ann.idRow === row.idRow && ann.idColumn === colIdx);
                                    const confidenceScore = annotation?.entity[0]?.score ?? null;
                                    console.log('annotation:', annotation, 'confidenceScore:', confidenceScore)
                                    const cellColor = hasAnnotation ? getCellColor(confidenceScore) : 'inherit';

                                    return (
                                        <TableCell
                                            key={colIdx}
                                            onClick={hasAnnotation ? () => handleCellClick(row.idRow, colIdx) : undefined}
                                            style={{ cursor: hasAnnotation ? 'pointer' : 'inherit' }}
                                            title={confidenceScore ? `Confidence: ${confidenceScore}` : ''}
                                        >
                                            {cell}
                                            {hasAnnotation && (
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        display: 'inline-block',
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: '50%',
                                                        backgroundColor: cellColor,
                                                        ml: 1,
                                                    }}
                                                />
                                            )}
                                            {confidenceScore !== null && (
                                                <Typography variant="caption" display="block" sx={{ color: 'grey', marginLeft: '4px' }}>
                                                    {confidenceScore === 0 ? `(0.00)` : `(${confidenceScore.toFixed(2)})`}
                                                </Typography>
                                            )}
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