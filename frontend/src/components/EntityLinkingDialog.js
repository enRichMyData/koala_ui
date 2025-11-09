import React from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  LinearProgress,
  Radio,
  RadioGroup,
  TextField,
  Typography
} from '@mui/material';

const getColumnDefaults = (columns) => (
  columns
    .filter(col => col.type === 'NE')
    .map(col => col.index)
);

const EntityLinkingDialog = ({
  open,
  onClose,
  columns = [],
  rows = [],
  loading = false,
  onSubmit,
  errorMessage = null
}) => {
  const [selectedColumns, setSelectedColumns] = React.useState(getColumnDefaults(columns));
  const [rowMode, setRowMode] = React.useState('page');
  const [selectedRowIds, setSelectedRowIds] = React.useState([]);
  const [provider, setProvider] = React.useState('lion');
  const [language, setLanguage] = React.useState('en');

  React.useEffect(() => {
    if (open) {
      setSelectedColumns(getColumnDefaults(columns));
      setRowMode('page');
      setSelectedRowIds([]);
      setProvider('lion');
      setLanguage('en');
    }
  }, [open, columns, rows]);

  const toggleColumn = (index) => {
    setSelectedColumns(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const toggleRow = (rowId) => {
    setSelectedRowIds(prev =>
      prev.includes(rowId) ? prev.filter(id => id !== rowId) : [...prev, rowId]
    );
  };

  const rowsInScope = rowMode === 'page' ? rows : rows.filter(row => selectedRowIds.includes(row.idRow));
  const totalCells = rowsInScope.length * selectedColumns.length;
  const disableSubmit = selectedColumns.length === 0 || rowsInScope.length === 0;

  const handleSubmit = () => {
    if (disableSubmit || !onSubmit) return;
    onSubmit({
      columnIndices: selectedColumns,
      rowMode,
      rowIds: rowsInScope.map(row => row.idRow),
      provider,
      language: provider === 'wikidata_reconcile' ? language : undefined
    });
  };

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>Run LLM Entity Linking</DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Choose the portion of the current page you want to send to a linking service.
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Columns
          </Typography>
          <FormGroup row>
            {columns.map((column) => (
              <FormControlLabel
                key={column.index}
                control={
                  <Checkbox
                    checked={selectedColumns.includes(column.index)}
                    onChange={() => toggleColumn(column.index)}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2">{column.name}</Typography>
                    {column.type && (
                      <Chip
                        label={column.type}
                        size="small"
                        color={column.type === 'NE' ? 'primary' : 'default'}
                      />
                    )}
                  </Box>
                }
              />
            ))}
          </FormGroup>
          {selectedColumns.length === 0 && (
            <Typography variant="caption" color="error">
              Select at least one column.
            </Typography>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Rows
          </Typography>
          <RadioGroup
            value={rowMode}
            onChange={(event) => {
              const value = event.target.value;
              setRowMode(value);
              if (value === 'page') {
                setSelectedRowIds([]);
              }
            }}
          >
            <FormControlLabel
              value="page"
              control={<Radio />}
              label={`All rows on this page (${rows.length})`}
            />
            <FormControlLabel
              value="custom"
              control={<Radio />}
              label="Select specific rows"
            />
          </RadioGroup>
          {rowMode === 'custom' && (
            <Box
              sx={{
                maxHeight: 200,
                overflow: 'auto',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 1
              }}
            >
              <FormGroup>
                {rows.map((row, idx) => (
                  <FormControlLabel
                    key={row.idRow}
                    control={
                      <Checkbox
                        checked={selectedRowIds.includes(row.idRow)}
                        onChange={() => toggleRow(row.idRow)}
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Typography variant="body2">
                          Row {idx + 1} (ID {row.idRow})
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {row.data.slice(0, 2).join(' | ')}
                          {row.data.length > 2 && '...'}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </FormGroup>
              {selectedRowIds.length === 0 && (
                <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                  Select at least one row.
                </Typography>
              )}
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Provider
          </Typography>
          <RadioGroup
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            <FormControlLabel
              value="lion"
              control={<Radio />}
              label="Lion (LLM-powered linker)"
            />
            <FormControlLabel
              value="wikidata_reconcile"
              control={<Radio />}
              label="Wikidata Reconciliation API"
            />
          </RadioGroup>
          {provider === 'wikidata_reconcile' && (
            <TextField
              label="Language code"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              size="small"
              helperText="ISO language code (e.g., en, fr, es)"
              sx={{ mt: 1, maxWidth: 200 }}
            />
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2">
            Cells to process: <strong>{totalCells}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Linking runs only on data currently visible in the table.
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
            <Typography variant="caption" color="text.secondary">
              Running linking task...
            </Typography>
          </Box>
        )}

        {errorMessage && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Close
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={disableSubmit || loading}
        >
          Run linking
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EntityLinkingDialog;
