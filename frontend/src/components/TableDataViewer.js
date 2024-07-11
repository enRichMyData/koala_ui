import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getTableData } from '../services/apiServices';
import {
    CircularProgress, Table, TableBody, TableContainer, Paper, Typography, Box,
    Button, Pagination, TableHead, Chip, TableRow, TableCell
} from '@mui/material';
import EntityDetailsModal from './EntityDetailsModal';
import FilterModal from './FilterModal';
import SortIcon from '@mui/icons-material/Sort';
import CompressIcon from '@mui/icons-material/Compress';
import ExpandIcon from '@mui/icons-material/Expand';
import ClearAllIcon from '@mui/icons-material/ClearAll';

import TableHeader from './TableHeader';
import TableRowComponent from './TableRow';

function TableDataViewer() {
    const { datasetName, tableName } = useParams();
    const [tableData, setTableData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [status, setStatus] = useState('');
    const [entityModalOpen, setEntityModalOpen] = useState(false);
    const [entityModalData, setEntityModalData] = useState(null);
    const [typeModalOpen, setTypeModalOpen] = useState(false);
    const [typeModalData, setTypeModalData] = useState(null);
    const [sortColumn, setSortColumn] = useState(null);
    const [sortOrder, setSortOrder] = useState(null);
    const [sortableColumns, setSortableColumns] = useState([]);
    const [compact, setCompact] = useState(false);
    const [columnTypes, setColumnTypes] = useState([]);
    const [ctaData, setCtaData] = useState({});
    const [filter, setFilter] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await getTableData(
                    datasetName,
                    tableName,
                    currentPage,
                    10,
                    sortColumn !== null && sortColumn !== undefined ? sortColumn : filter?.columnIndex,
                    sortOrder,
                    filter?.selectedTypes ? Object.keys(filter.selectedTypes).join(' ') : null,
                    filter?.mode
                );

                console.log("sortColumn", sortColumn);
                console.log("params", datasetName, tableName, currentPage, 10, sortColumn !== null && sortColumn !== undefined ? sortColumn : filter?.columnIndex, sortOrder, filter?.selectedTypes ? Object.keys(filter.selectedTypes).join(' ') : null, filter?.mode);

                setTableData(response.data);
                setStatus(response.data.status);
                setTotalPages(response.pagination.totalPages);

                const sortableCols = [];
                const colTypes = [];
                const cta = {};

                response.data.header.forEach((header, index) => {
                    if (response.data.metadata && response.data.metadata.column) {
                        const columnMetadata = response.data.metadata.column.find(item => item.idColumn === index);
                        if (columnMetadata) {
                            if (columnMetadata.tag === 'NE' || columnMetadata.tag === 'SUBJ') {
                                sortableCols.push(index);
                                colTypes[index] = 'NE';
                            } else {
                                colTypes[index] = 'LIT';
                            }
                        }
                    }
                    const ctaColumn = response.data.semanticAnnotations.cta.find(cta => cta.idColumn === index);
                    if (ctaColumn) {
                        cta[index] = ctaColumn.types;
                    }
                });

                setSortableColumns(sortableCols);
                setColumnTypes(colTypes);
                setCtaData(cta);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const intervalId = (status === 'DOING' || status === 'TODO') ? setInterval(fetchData, 5000) : null;

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [datasetName, tableName, currentPage, status, sortColumn, sortOrder, filter]);

    const handleCellClick = (rowId, colId) => {
        const annotations = tableData.semanticAnnotations.cea.filter(ann => ann.idRow === rowId && ann.idColumn === colId);
        if (annotations.length > 0) {
            setEntityModalData(annotations[0].entities);
            setEntityModalOpen(true);
        }
    };

    const handleEntityModalClose = () => {
        setEntityModalOpen(false);
        setEntityModalData(null);
    };

    const handleTypeModalClose = () => {
        setTypeModalOpen(false);
        setTypeModalData(null);
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

    const handleHeaderClick = (ctaTypes, columnIndex) => {
        setTypeModalData({ ctaTypes, columnIndex });
        setTypeModalOpen(true);
    };

    const applyFilter = (columnIndex, selectedTypes, mode) => {
        setFilter({ columnIndex, selectedTypes, mode });
    };

    const resetFilters = () => {
        setFilter(null);
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
                <Button onClick={resetFilters} color="primary" startIcon={<ClearAllIcon />}>
                    Reset Filters
                </Button>
            </Box>
            {filter && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', mb: 2 }}>
                    {Object.keys(filter.selectedTypes).map((type) => (
                        filter.selectedTypes[type] && (
                            <Chip
                                key={type}
                                label={`Column ${filter.columnIndex}: ${filter.selectedTypes[type]} (${filter.mode})`}
                                sx={{ m: 0.5 }}
                            />
                        )
                    ))}
                </Box>
            )}
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table size={compact ? 'small' : 'medium'}>
                    <TableHead>
                        <TableHeader
                            headers={tableData.header}
                            sortableColumns={sortableColumns}
                            sortColumn={sortColumn}
                            sortOrder={sortOrder}
                            handleSort={handleSort}
                            columnTypes={columnTypes}
                            ctaData={ctaData}
                            handleHeaderClick={handleHeaderClick}
                        />
                    </TableHead>
                    {tableData.rows.length === 0 ? (
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={tableData.header.length} align="center">
                                    <Typography variant="subtitle1" color="error">
                                        No data matches the filter criteria.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    ) : (
                        <TableBody>
                            {tableData.rows.map((row, idx) => (
                                <TableRowComponent
                                    key={idx}
                                    row={row}
                                    tableData={tableData}
                                    handleCellClick={handleCellClick}
                                />
                            ))}
                        </TableBody>
                    )}
                </Table>
            </TableContainer>
            <Pagination count={totalPages} page={currentPage} onChange={(event, page) => setCurrentPage(page)} color="primary" sx={{ py: 2 }} />
            {entityModalOpen && <EntityDetailsModal data={entityModalData} onClose={handleEntityModalClose} />}
            {typeModalOpen && (
                <FilterModal
                    open={typeModalOpen}
                    onClose={handleTypeModalClose}
                    ctaTypes={typeModalData.ctaTypes}
                    columnIndex={typeModalData.columnIndex}
                    applyFilter={applyFilter}
                />
            )}
        </Box>
    );
}

export default TableDataViewer;