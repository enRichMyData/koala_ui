import React from 'react';
import { TableCell, TableRow, Tooltip, Box, Typography, Chip, Checkbox } from '@mui/material';

const TableHeader = ({
  headers,
  columnTypes,
  columnSubtypes,
  columnSpecificSubtypes,
  columnDpvAnnotations,
  showDpvAnnotations,
  showRowSelection,
  showRowIndex,
  allRowsSelected,
  someRowsSelected,
  onToggleAllRows
}) => (
  <TableRow>
    {(showRowSelection || showRowIndex) && (
      <TableCell
        sx={{
          backgroundColor: '#f5f5f5',
          borderBottom: '2px solid #ccc',
          py: 1.5,
          px: 1,
          textAlign: 'center',
          width: 56
        }}
      >
        {showRowSelection ? (
          <Checkbox
            size="small"
            checked={Boolean(allRowsSelected)}
            indeterminate={Boolean(someRowsSelected)}
            onChange={(event) => onToggleAllRows?.(event.target.checked)}
          />
        ) : (
          <Typography variant="caption" color="text.secondary">
            Row
          </Typography>
        )}
      </TableCell>
    )}
    {headers.map((header, index) => {
      const isNE = columnTypes[index] === 'NE';
      const subtype = columnSubtypes[index];
      const specificSubtype = columnSpecificSubtypes?.[index] || '';
      const showSpecific = specificSubtype && specificSubtype !== subtype;
      const bg = isNE ? '#e8f5e9' : '#fff9c4';
      const dpvEntry = columnDpvAnnotations?.[index] || null;
      const dpvType = dpvEntry?.typeId || '';
      const dpvConfidence = typeof dpvEntry?.confidence === 'number' ? dpvEntry.confidence : null;
      const dpvTitle = dpvConfidence !== null
        ? `DPV confidence ${Math.round(dpvConfidence * 100)}%`
        : 'DPV annotation';

      return (
        <TableCell
          key={index}
          sx={{
            backgroundColor: bg,
            borderBottom: '2px solid #ccc',
            py: 1.5,
            px: 2,
            textAlign: 'center',
            cursor: 'default',
            transition: 'background 0.2s',
            '&:hover': { backgroundColor: isNE ? '#c8e6c9' : bg }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <Tooltip title={isNE ? 'Named Entity (NE)' : 'Literal (LIT)'} arrow>
              <Typography variant="subtitle2" noWrap>
                {header}
              </Typography>
            </Tooltip>
          </Box>
          {subtype && (
            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={subtype}
                size="small"
                sx={{ fontSize: '0.65rem' }}
                color={isNE ? 'success' : 'warning'}
                variant="outlined"
              />
              {showSpecific && (
                <Chip
                  label={specificSubtype}
                  size="small"
                  sx={{ fontSize: '0.65rem' }}
                  variant="outlined"
                />
              )}
            </Box>
          )}
          {showDpvAnnotations && dpvType && (
            <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'center' }}>
              <Tooltip title={dpvTitle} arrow>
                <Chip
                  label={`DPV ${dpvType}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: '0.6rem',
                    color: '#5f6b7a',
                    borderColor: '#d0d7de',
                    bgcolor: '#f7f9fb'
                  }}
                />
              </Tooltip>
            </Box>
          )}
        </TableCell>
      );
    })}
  </TableRow>
);

export default TableHeader;
