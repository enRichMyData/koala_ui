import React from 'react';
import { TableCell, TableRow, Box, Typography } from '@mui/material';

const getCellColor = (confidenceScore) => {
    if (confidenceScore > 0.8) return 'green';
    if (confidenceScore >= 0.5) return 'yellow';
    return 'red';
};

const TableRowComponent = ({ row, tableData, handleCellClick }) => {
    return (
        <TableRow key={row.idRow}>
            {row.data.map((cell, colIdx) => {
                const hasAnnotation = tableData.semanticAnnotations.cea.some(ann => ann.idRow === row.idRow && ann.idColumn === colIdx && ann.entities.length > 0);
                const annotation = tableData.semanticAnnotations.cea.find(ann => ann.idRow === row.idRow && ann.idColumn === colIdx);
                const confidenceScore = annotation?.entities[0]?.score ?? null;
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
    );
};

export default TableRowComponent;