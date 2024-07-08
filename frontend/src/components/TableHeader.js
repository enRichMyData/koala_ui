import React from 'react';
import { TableCell, TableRow, Tooltip, Chip, IconButton, Box } from '@mui/material';
import SortIcon from '@mui/icons-material/Sort';
import InfoIcon from '@mui/icons-material/Info';

const TableHeader = ({ headers, sortableColumns, sortColumn, sortOrder, handleSort, columnTypes, ctaData, handleHeaderClick }) => {
    return (
        <TableRow>
            {headers.map((header, index) => {
                const isSortable = sortableColumns.includes(index);
                const columnType = columnTypes[index];
                const backgroundColor = columnType === 'NE' ? '#d0f0c0' : '#f0e68c';
                const headerTooltip = columnType === 'NE' ? 'Named Entity (NE)' : 'Literal (LIT)';
                const ctaTypes = ctaData[index] || [];
                const mainType = ctaTypes.length > 0 ? ctaTypes[0] : null;

                return (
                    <TableCell 
                        key={index}
                        style={{ 
                            backgroundColor,
                            border: sortColumn === index ? '2px solid #3f51b5' : 'none' 
                        }}
                    >
                        <Tooltip title={headerTooltip} arrow>
                            <span>
                                {header} {columnType ? `(${columnType})` : ''}
                            </span>
                        </Tooltip>
                        {isSortable && (
                            <IconButton
                                size="small"
                                onClick={() => handleSort(index)}
                                sx={{ ml: 1 }}
                            >
                                <SortIcon />
                            </IconButton>
                        )}
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
    );
};

export default TableHeader;