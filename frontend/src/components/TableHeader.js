import React from 'react';
import { TableCell, TableRow, Tooltip, Box, Typography, Chip, Checkbox } from '@mui/material';

const TableHeader = ({
  headers,
  columnTypes,
  columnSubtypes,
  columnSpecificSubtypes,
  columnDpvAnnotations,
  columnReconciliationTypes,
  showDpvAnnotations,
  onNeColumnClick,
  activeNeColumn,
  showRowSelection,
  showRowIndex,
  allRowsSelected,
  someRowsSelected,
  onToggleAllRows,
  compact = false
}) => (
  <TableRow>
    {(showRowSelection || showRowIndex) && (
      <TableCell
        sx={{
          backgroundColor: '#f5f5f5',
          borderBottom: '2px solid #ccc',
          py: compact ? 0.75 : 1.1,
          px: 1,
          textAlign: 'center',
          width: 56,
          position: 'sticky',
          left: 0,
          zIndex: 5
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
      const reconType = columnReconciliationTypes?.[index] || null;
      const reconLabel = reconType?.name || reconType?.id || '';
      const reconFrequency = typeof reconType?.frequency === 'number'
        ? Math.round(reconType.frequency * 100)
        : null;
      const reconProbability = typeof reconType?.probability === 'number'
        ? Math.round(reconType.probability * 100)
        : null;
      const reconTitle = reconFrequency !== null
        ? `Top linked type ${reconLabel} (frequency ${reconFrequency}%)`
        : reconProbability !== null
          ? `Top linked type ${reconLabel} (${reconProbability}%)`
        : `Top linked type ${reconLabel}`;
      const isActiveNeColumn = activeNeColumn === index;

      return (
        <TableCell
          key={index}
          sx={{
            backgroundColor: bg,
            borderBottom: '2px solid #ccc',
            py: compact ? 0.75 : 1.1,
            px: compact ? 1.2 : 1.5,
            textAlign: 'center',
            cursor: isNE ? 'pointer' : 'default',
            transition: 'background 0.2s',
            outline: isActiveNeColumn ? '2px solid #7aa7d9' : 'none',
            outlineOffset: isActiveNeColumn ? '-2px' : 0,
            zIndex: 3,
            '&:hover': { backgroundColor: isNE ? '#c8e6c9' : bg }
          }}
          onClick={() => {
            if (isNE && onNeColumnClick) {
              onNeColumnClick(index);
            }
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
          {isNE && reconLabel && (
            <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'center' }}>
              <Tooltip title={reconTitle} arrow>
                <Chip
                  label={`KG ${reconLabel}${reconFrequency !== null ? ` ${reconFrequency}%` : reconProbability !== null ? ` ${reconProbability}%` : ''}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: '0.6rem',
                    color: '#375a7f',
                    borderColor: '#b7cee6',
                    bgcolor: '#edf5ff'
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
