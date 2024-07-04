import axios from 'axios';

const ALLIGATOR_API_URL = process.env.REACT_APP_ALLIGATOR_URL;
const ALLIGATOR_API_TOKEN = process.env.REACT_APP_ALLIGATOR_TOKEN;
const LAMAPI_URL = process.env.REACT_APP_LAMAPI_URL;
const LAMAPI_TOKEN = process.env.REACT_APP_LAMAPI_TOKEN;

// Alligator API Client
const alligatorApiClient = axios.create({
  baseURL: ALLIGATOR_API_URL,
});

// Attach token to every request for Alligator API
alligatorApiClient.interceptors.request.use(config => {
  config.params = config.params || {};
  config.params['token'] = ALLIGATOR_API_TOKEN;
  return config;
});

// Simple retry interceptor for specific status codes for Alligator API
alligatorApiClient.interceptors.response.use(null, async (error) => {
  const { config, response } = error;
  const maxRetries = 3;
  if (response && response.status >= 500 && config.retryCount < maxRetries) {
    config.retryCount = config.retryCount ? config.retryCount + 1 : 1;
    return alligatorApiClient(config);  // Retry the request with the updated config
  }
  return Promise.reject(error);
});

// LamAPI Client
const lamapiClient = axios.create({
  baseURL: LAMAPI_URL,
});

// Attach token to every request for LamAPI
lamapiClient.interceptors.request.use(config => {
  config.params = config.params || {};
  config.params['token'] = LAMAPI_TOKEN;
  return config;
});

// Alligator API functions
const createDataset = async (datasetName) => {
  try {
    const response = await alligatorApiClient.post('/dataset', null, {
      params: {
        datasetName: datasetName,
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error creating dataset:', error);
    throw error;
  }
};

const getDatasets = async (page = 1, perPage = 10) => {
  try {
    const response = await alligatorApiClient.get('/dataset', {
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

const uploadTable = async (datasetName, file, kgReference="wikidata") => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kgReference', kgReference);

  try {
    const response = await alligatorApiClient.post(`/dataset/${datasetName}/table`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error uploading table:', error);
    throw error;
  }
};

const getTables = async (datasetName, page = 1, perPage = 10) => {
  try {
    const response = await alligatorApiClient.get(`/dataset/${datasetName}/table`, {
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
    const response = await alligatorApiClient.get(`/dataset/${datasetName}/table/${tableName}`, {
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

const deleteDataset = async (datasetName) => {
  try {
    const response = await alligatorApiClient.delete(`/dataset/${datasetName}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting dataset:', error);
    throw error;
  }
};

const deleteTable = async (datasetName, tableName) => {
  try {
    const response = await alligatorApiClient.delete(`/dataset/${datasetName}/table/${tableName}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting table:', error);
    throw error;
  }
};

// LamAPI function
const fetchCandidates = async (query) => {
  try {
    const response = await lamapiClient.get('/lookup/entity-retrieval', {
      params: {
        name: query,
        limit: 100,
        kg: 'wikidata',
        query: JSON.stringify({
          query: {
            match: {
              name: query,
            }
          }
        }),
      }
    });
    console.log('LamAPI Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching candidates:', error);
    throw error;
  }
};

export { getDatasets, getTables, getTableData, deleteDataset, deleteTable, fetchCandidates, createDataset, uploadTable };