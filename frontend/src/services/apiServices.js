import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL;
const API_TOKEN = process.env.REACT_APP_API_TOKEN;

const apiClient = axios.create({
  baseURL: API_URL,
});

// Attach token to every request
apiClient.interceptors.request.use(config => {
  config.params = config.params || {};
  config.params['token'] = API_TOKEN;
  return config;
});

// Simple retry interceptor for specific status codes
apiClient.interceptors.response.use(null, async (error) => {
  const { config, response } = error;
  const maxRetries = 3;
  if (response && response.status >= 500 && config.retryCount < maxRetries) {
    config.retryCount = config.retryCount ? config.retryCount + 1 : 1;
    return apiClient(config);  // Retry the request with the updated config
  }
  return Promise.reject(error);
});

const getDatasets = async (page = 1, perPage = 10) => {
  try {
    const response = await apiClient.get('/dataset', {
      params: {
        page,
        per_page: perPage,
      },
    });
    console.log('API Response:', response.data); // This will help ensure the response is as expected
    return {
      data: response.data.data,
      pagination: response.data.pagination
    };
  } catch (error) {
    console.error('Error retrieving datasets:', error);
    throw error;
  }
};

const getTables = async (datasetName, page = 1, perPage = 10) => {
  try {
    const response = await apiClient.get(`/dataset/${datasetName}/table`, {
      params: {
        page,
        per_page: perPage,
      },
    });
    console.log('API Response:', response.data);
    return {
      data: response.data.data,
      pagination: response.data.pagination
    };
  } catch (error) {
    console.error('Error retrieving tables:', error);
    throw error;
  }
};

const getTableData = async (datasetName, tableName, page = 1, perPage = 10, column = null, sort = null) => {
  try {
    const response = await apiClient.get(`/dataset/${datasetName}/table/${tableName}`, {
      params: {
        page,
        per_page: perPage,
        column,
        sort,
      },
    });
    console.log('API Response:', response.data);
    return {
      data: response.data.data,
      pagination: response.data.pagination
    };
  } catch (error) {
    console.error('Error retrieving table data:', error);
    throw error;
  }
};

// Function to delete a dataset
const deleteDataset = async (datasetName) => {
  try {
    const response = await apiClient.delete(`/dataset/${datasetName}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting dataset:', error);
    throw error;
  }
};

// Function to delete a table
const deleteTable = async (datasetName, tableName) => {
  try {
    const response = await apiClient.delete(`/dataset/${datasetName}/table/${tableName}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting table:', error);
    throw error;
  }
};

export { getDatasets, getTables, getTableData, deleteDataset, deleteTable };