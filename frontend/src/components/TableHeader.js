import React from 'react';
import { TableCell, TableRow, Tooltip, Chip, IconButton, Box } from '@mui/material';
import SortIcon from '@mui/icons-material/Sort';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import InfoIcon from '@mui/icons-material/Info';

const TableHeader = ({ headers, sortableColumns, sortColumn, sortOrder, handleSort, columnTypes, ctaData, handleHeaderClick }) => (
  <TableRow>
    {headers.map((header, index) => {
      const isNE = columnTypes[index] === 'NE';
      const ctaTypes = ctaData[index] || [];
      const bg = columnTypes[index] === 'NE' ? '#d0f0c0' : '#f0e68c';
      return (
        <TableCell
          key={index}
          style={{
            backgroundColor: bg,
            border: sortColumn === index ? '2px solid #3f51b5' : 'none',
            padding: '8px 16px',
            position: 'relative',
            cursor: isNE ? 'pointer' : 'default',
            textDecoration: isNE ? 'underline' : 'none'
          }}
          onClick={isNE ? () => handleHeaderClick(ctaTypes, index) : undefined}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Tooltip title={columnTypes[index] === 'NE' ? 'Named Entity (NE)' : 'Literal (LIT)'} arrow>
              <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                {header} {columnTypes[index]}
              </Box>
            </Tooltip>
            {sortableColumns.includes(index) && (
              <IconButton size="small" onClick={() => handleSort(index)} sx={{ ml: 1 }}>
                {sortColumn === index
                  ? (sortOrder === 'asc' ? <ArrowDropUpIcon /> : <ArrowDropDownIcon />)
                  : <SortIcon />
                }
              </IconButton>
            )}
          </Box>
          {ctaTypes.length > 0 && (
            <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap' }}>
              {/* show top type badge */}
              <Chip label={ctaTypes[0].name} size="small" color="primary" clickable />
              {ctaTypes.length > 1 && <IconButton size="small"><InfoIcon fontSize="small" /></IconButton>}
            </Box>
          )}
        </TableCell>
      );
    })}
  </TableRow>
);

export default TableHeader;