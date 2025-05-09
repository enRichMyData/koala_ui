import React from 'react';
import { TableCell, TableRow, Tooltip, IconButton, Box, Typography } from '@mui/material';
import SortIcon from '@mui/icons-material/Sort';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import FilterListIcon from '@mui/icons-material/FilterList';

const TableHeader = ({
  headers, sortableColumns, sortColumn, sortOrder,
  handleSort, columnTypes, ctaData, handleHeaderClick
}) => (
  <TableRow>
    {headers.map((header, index) => {
      const isNE = columnTypes[index] === 'NE';
      const types = Array.isArray(ctaData[index]) ? ctaData[index] : ctaData[index]?.types || [];
      // Sort types by frequency (descending)
      const sortedTypes = [...types].sort((a, b) => b.frequency - a.frequency);
      const bg = isNE ? '#e8f5e9' : '#fff9c4';

      return (
        <TableCell
          key={index}
          onClick={undefined}
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
            {sortableColumns.includes(index) && (
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); handleSort(index); }}
              >
                {sortColumn === index
                  ? (sortOrder === 'asc' ? <ArrowDropUpIcon /> : <ArrowDropDownIcon />)
                  : <SortIcon />
                }
              </IconButton>
            )}
          </Box>
          <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center', gap: 1 }}>
            {isNE && sortedTypes.length > 0 && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleHeaderClick(sortedTypes, header, index);
                }}
                title="Filter by entity types in this column"
              >
                <FilterListIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </TableCell>
      );
    })}
  </TableRow>
);

export default TableHeader;