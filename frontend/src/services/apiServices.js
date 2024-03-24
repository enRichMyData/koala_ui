import axios from 'axios';

const API_URL = 'https://alligator.hel.sintef.cloud'; // Replace with the actual URL of your API
const API_TOKEN = 'alligator_demo_2023'; // Replace with your actual API token

const getDatasets = async (page = 1) => {
  try {
    const response = await axios.get(`${API_URL}/dataset`, {
      params: {
        page: page,
        token: API_TOKEN  // Make sure to send the token as a query parameter
      }
    });
    return response.data;  // Contains the list of datasets
  } catch (error) {
    console.error('There was an error retrieving the datasets!', error);
    throw error;
  }
};

export { getDatasets };


