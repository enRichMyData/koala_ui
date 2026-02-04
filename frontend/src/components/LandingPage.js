import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import HubIcon from '@mui/icons-material/Hub';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import logo from '../assets/images/koala_logo.webp';

const FEATURES = [
  {
    icon: <HubIcon color="primary" />,
    title: 'Reconcile with multiple services',
    description: 'Run Lion Linker or Crocodile and keep one shared cell-level overview.'
  },
  {
    icon: <AutoGraphIcon color="primary" />,
    title: 'Ranking + score-based review',
    description: 'Use NE type ranking, NE score sorting, and row score averages for fast QA.'
  },
  {
    icon: <FileDownloadIcon color="primary" />,
    title: 'Export enriched CSV',
    description: 'Choose which reconciliation attributes to include in export.'
  }
];

const LandingPage = ({ isLoggedIn }) => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    if (isLoggedIn) {
      navigate('/dataset');
      return;
    }
    navigate('/login');
  };

  return (
    <Box sx={{ bgcolor: '#f5f8fc', minHeight: '100vh', pb: 5 }}>
      <Box
        sx={{
          borderBottom: '1px solid #dfe8f5',
          background: 'linear-gradient(135deg, #fbfdff 0%, #eff5ff 60%, #f5f8fc 100%)'
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 6 } }}>
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 2,
              p: { xs: 2, md: 3 },
              borderColor: '#d6e2f5'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Box
                component="img"
                src={logo}
                alt="Koala"
                sx={{ width: 56, height: 56, objectFit: 'contain' }}
              />
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                  Koala UI
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  A clean workspace for tabular reconciliation and enrichment.
                </Typography>
              </Box>
            </Box>

            <Stack direction="row" spacing={1} sx={{ mb: 2 }} useFlexGap flexWrap="wrap">
              <Chip size="small" color="success" label="Lion Linker + Crocodile" />
              <Chip size="small" variant="outlined" label="Shared candidate view" />
              <Chip size="small" variant="outlined" color="secondary" label="Profile-based credentials" />
            </Stack>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button variant="contained" onClick={handleGetStarted} sx={{ textTransform: 'none' }}>
                {isLoggedIn ? 'Open datasets' : 'Get started'}
              </Button>
              <Button variant="outlined" onClick={() => navigate('/docs')} sx={{ textTransform: 'none' }}>
                Documentation
              </Button>
            </Stack>
          </Paper>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ mt: 3 }}>
        <Grid container spacing={2}>
          {FEATURES.map((feature) => (
            <Grid item xs={12} md={4} key={feature.title}>
              <Card variant="outlined" sx={{ height: '100%', borderColor: '#e2e9f5' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  {feature.icon}
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {feature.description}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
};

export default LandingPage;
