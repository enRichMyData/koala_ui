import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box,
  Button, 
  Container, 
  Typography, 
  Grid, 
  Card, 
  CardContent, 
  Paper,
  useTheme,
  useMediaQuery
} from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';
import StorageIcon from '@mui/icons-material/Storage';
import SearchIcon from '@mui/icons-material/Search';
import VerifiedIcon from '@mui/icons-material/Verified';
import logo from '../assets/images/koala_logo.webp';

const LandingPage = ({ isLoggedIn }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const handleGetStarted = () => {
    if (isLoggedIn) {
      navigate('/dataset');
    } else {
      navigate('/login');
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Hero Section */}
      <Paper
        sx={{
          position: 'relative',
          backgroundColor: '#f8f9fa',
          color: '#333',
          mb: 2,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          minHeight: '45vh',
          display: 'flex',
          alignItems: 'center',
          py: 2, // Reduced vertical padding
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography
                component="h1"
                variant="h2"
                color="inherit"
                gutterBottom
                sx={{ fontWeight: 700, mb: 1 }}
              >
                Koala UI
              </Typography>
              <Typography variant="h5" color="inherit" paragraph sx={{ mb: 1.5 }}>
                Upload, organize, and explore datasets with fast search, filters, and column typing.
              </Typography>
              <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleGetStarted}
                  sx={{ 
                    px: 4,
                    py: 1.2,
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    borderRadius: 2,
                    mb: 2,
                  }}
                >
                  {isLoggedIn ? 'Go to Dashboard' : 'Get Started'}
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  sx={{ 
                    ml: 2,
                    px: 4,
                    py: 1.2,
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    borderRadius: 2
                  }}
                  href="https://github.com/enRichMyData/koala_ui"
                  target="_blank"
                >
                  Learn More
                </Button>
              </Box>
            </Grid>
            <Grid item xs={12} md={6} sx={{ display: 'flex', justifyContent: 'center' }}>
              <Box
                component="img"
                src={logo}
                alt="Koala Logo"
                sx={{
                  width: isMobile ? '50%' : '60%',
                  maxWidth: 300,
                  height: 'auto',
                  filter: 'drop-shadow(0px 4px 8px rgba(0,0,0,0.2))'
                }}
              />
            </Grid>
          </Grid>
        </Container>
      </Paper>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ my: 3 }}>
        <Typography variant="h3" align="center" gutterBottom>
          Key Features
        </Typography>
        <Typography variant="h6" align="center" color="text.secondary" paragraph>
          Everything you need to manage tabular datasets end-to-end
        </Typography>
        
        <Grid container spacing={3} sx={{ mt: 1.5 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                <TableChartIcon color="primary" sx={{ fontSize: 60 }} />
              </Box>
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography gutterBottom variant="h5" component="h2" align="center">
                  Table Processing
                </Typography>
                <Typography align="center">
                  Upload CSV tables and keep them organized by dataset.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                <StorageIcon color="primary" sx={{ fontSize: 60 }} />
              </Box>
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography gutterBottom variant="h5" component="h2" align="center">
                  Dataset Storage
                </Typography>
                <Typography align="center">
                  Persist tables with pagination and fast retrieval.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                <SearchIcon color="primary" sx={{ fontSize: 60 }} />
              </Box>
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography gutterBottom variant="h5" component="h2" align="center">
                  Search & Filters
                </Typography>
                <Typography align="center">
                  Find rows by text, types, and score sorting.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                <VerifiedIcon color="primary" sx={{ fontSize: 60 }} />
              </Box>
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography gutterBottom variant="h5" component="h2" align="center">
                  Column Typing
                </Typography>
                <Typography align="center">
                  Classify columns as NE or LIT with editable subtypes.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>

      {/* Call to action section */}
      <Box sx={{ bgcolor: 'primary.main', color: 'white', py: 8 }}>
        <Container maxWidth="md">
          <Typography variant="h4" align="center" gutterBottom>
            Ready to organize your data?
          </Typography>
          <Typography variant="h6" align="center" paragraph>
            Start building datasets and exploring them today.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <Button 
              variant="contained" 
              color="secondary" 
              size="large"
              onClick={handleGetStarted}
              sx={{ 
                px: 4, 
                py: 1.5,
                fontSize: '1.1rem',
                fontWeight: 'bold',
                borderRadius: 2,
                backgroundColor: 'white',
                color: 'primary.main',
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.9)'
                }
              }}
            >
              {isLoggedIn ? 'Go to Dashboard' : 'Sign Up Now'}
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Footer */}
      <Box component="footer" sx={{ bgcolor: 'background.paper', py: 6 }}>
        <Container maxWidth="lg">
          <Typography variant="h6" align="center" gutterBottom>
            KOALA
          </Typography>
          <Typography
            variant="subtitle1"
            align="center"
            color="text.secondary"
            component="p"
          >
            Dataset management and exploration workspace
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center">
            {'© '}
            {new Date().getFullYear()}
            {' Koala Team. All rights reserved.'}
          </Typography>
        </Container>
      </Box>
    </Box>
  );
};

export default LandingPage;
