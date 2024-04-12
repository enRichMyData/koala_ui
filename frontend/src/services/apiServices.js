import axios from 'axios';

// Use environment variables
const API_URL = process.env.REACT_APP_API_URL;
const API_TOKEN = process.env.REACT_APP_API_TOKEN;

const getDatasets = async (page = 1) => {
  try {
    const response = await axios.get(`${API_URL}/dataset`, {
      params: {
        page: page,
        token: API_TOKEN  // The token is sent as a query parameter
      }
    });
    return response.data;  // Contains the list of datasets
  } catch (error) {
    console.error('There was an error retrieving the datasets!', error);
    throw error;
  }
};

export { getDatasets };
