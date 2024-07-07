import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getTableData } from '../services/apiServices';
import {
    CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, Box,
    Button, Pagination, Tooltip, Chip, IconButton
} from '@mui/material';
import EntityDetailsModal from './EntityDetailsModal';
import TypeDetailsModal from './TypeDetailsModal';
import SortIcon from '@mui/icons-material/Sort';
import CompressIcon from '@mui/icons-material/Compress';
import ExpandIcon from '@mui/icons-material/Expand';
import InfoIcon from '@mui/icons-material/Info';

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

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await getTableData(datasetName, tableName, currentPage, 10, sortColumn, sortOrder);
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
    }, [datasetName, tableName, currentPage, status, sortColumn, sortOrder]);

    const handleCellClick = (rowId, colId) => {
        const annotations = tableData.semanticAnnotations.cea.filter(ann => ann.idRow === rowId && ann.idColumn === colId);
        if (annotations.length > 0) {
            setEntityModalData(annotations[0].entity);
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

    const handleHeaderClick = (ctaTypes) => {
        setTypeModalData(ctaTypes);
        setTypeModalOpen(true);
    };

    const getCellColor = (confidenceScore) => {
        if (confidenceScore > 0.8) return 'green';
        if (confidenceScore >= 0.5) return 'yellow';
        return 'red';
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
                                const columnType = columnTypes[index];
                                const backgroundColor = columnType === 'NE' ? '#d0f0c0' : '#f0e68c';
                                const headerTooltip = columnType === 'NE' ? 'Named Entity (NE)' : 'Literal (LIT)';
                                const ctaTypes = ctaData[index] || [];
                                const mainType = ctaTypes.length > 0 ? ctaTypes[0] : null;

                                return (
                                    <TableCell 
                                        key={index} 
                                        onClick={isSortable ? () => handleSort(index) : undefined}
                                        style={{ 
                                            cursor: isSortable ? 'pointer' : 'default',
                                            backgroundColor,
                                            border: sortColumn === index ? '2px solid #3f51b5' : 'none' 
                                        }}
                                    >
                                        <Tooltip title={headerTooltip} arrow>
                                            <span>
                                                {header} {columnType ? `(${columnType})` : ''} {sortColumn === index && (sortOrder === 'asc' ? '↑' : '↓')}
                                            </span>
                                        </Tooltip>
                                        {mainType && (
                                            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                                                <Tooltip title={`ID: ${mainType.id} | Score: ${mainType.score}`} arrow>
                                                    <Chip
                                                        label={mainType.name}
                                                        component="a"
                                                        href={`https://www.wikidata.org/wiki/${mainType.id}`}
                                                        target="_blank"
                                                        clickable
                                                        color="primary"
                                                        size="small"
                                                        sx={{ ml: 1 }}
                                                    />
                                                </Tooltip>
                                                {ctaTypes.length > 1 && (
                                                    <Tooltip title="Show more details" arrow>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleHeaderClick(ctaTypes)}
                                                            sx={{ ml: 1 }}
                                                        >
                                                            <InfoIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        )}
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
                {entityModalOpen && <EntityDetailsModal data={entityModalData} onClose={handleEntityModalClose} />}
                {typeModalOpen && <TypeDetailsModal data={typeModalData} open={typeModalOpen} onClose={handleTypeModalClose} />}
            </Box>
        );
    }
    
export default TableDataViewer;
  