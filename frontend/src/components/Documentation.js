import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography
} from '@mui/material';

const Documentation = () => {
  return (
    <Box sx={{ py: 3, bgcolor: '#f7f9fc', minHeight: '100vh' }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Documentation
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Latest workflow for reconciliation, type ranking, score sorting, and enriched export.
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>1) Profile setup</Typography>
                <List dense disablePadding>
                  <ListItem disableGutters>
                    <ListItemText primary="Set shared LLM provider/model/endpoint/API key (used by Moose and Lion Linker)." />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Configure Lion Linker URL, API key, and Lamapi endpoint/token/KG/candidates." />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Configure Crocodile URL and API key." />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Configure Moose URL and API key." />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Admins can manage users from Profile -> User admin tab." />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>2) Run reconciliation</Typography>
                <List dense disablePadding>
                  <ListItem disableGutters>
                    <ListItemText primary="Choose provider: Lion Linker or Crocodile." />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Choose scope: selected cells, selected rows, current page, or whole table." />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Set Top-K and run. Koala remaps row/column indices and stores merged cell results." />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Cell and column insights</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
            <Chip size="small" label="Candidate popup" color="primary" variant="outlined" />
            <Chip size="small" label="Wikidata links" color="primary" variant="outlined" />
            <Chip size="small" label="NIL handling" color="warning" variant="outlined" />
            <Chip size="small" label="NE type ranking" color="success" variant="outlined" />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Click linked NE cells to inspect top candidates, explanation text, types, description, and score. Click NE column headers to inspect ranking details computed from linked entity types (triggered job with sampling).
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Sorting, filtering, and pagination</Typography>
          <List dense disablePadding>
            <ListItem disableGutters>
              <ListItemText primary="Sort by score on a selected NE column." />
            </ListItem>
            <ListItem disableGutters>
              <ListItemText primary="Sort by row average score across NE cells (NIL/no-score entries are treated as 0)." />
            </ListItem>
            <ListItem disableGutters>
              <ListItemText primary="Apply NE semantic type filters and keep pagination stable for large tables." />
            </ListItem>
          </List>
        </Paper>

        <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Export enriched CSV</Typography>
          <Typography variant="body2" color="text.secondary">
            Export can include reconciliation enrichment columns. You can choose which attributes to append per NE column:
            <strong> id, name, description, types, score, match</strong>. The export uses the latest stored result per cell across providers.
          </Typography>
          <Divider sx={{ my: 1.5 }} />
          <Alert severity="info">
            Re-running reconciliation shows a confirmation dialog before replacing existing results.
          </Alert>
        </Paper>
      </Container>
    </Box>
  );
};

export default Documentation;
