import axios from 'axios';

const CROCODILE_API_URL = process.env.REACT_APP_CROCODILE_URL;
const LAMAPI_URL = process.env.REACT_APP_LAMAPI_URL;
const LAMAPI_TOKEN = process.env.REACT_APP_LAMAPI_TOKEN;

// Crocodile API Client
const crocodileApiClient = axios.create({
  baseURL: CROCODILE_API_URL,
});

// Simple retry interceptor for specific status codes for Crocodile API
crocodileApiClient.interceptors.response.use(null, async (error) => {
  const { config, response } = error;
  const maxRetries = 3;
  if (response && response.status >= 500 && config.retryCount < maxRetries) {
    config.retryCount = config.retryCount ? config.retryCount + 1 : 1;
    return crocodileApiClient(config);  // Retry the request with the updated config
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

// Crocodile API functions
const createDataset = async (datasetName) => {
  try {
    const response = await crocodileApiClient.post('/datasets', {
      dataset_name: datasetName
    });
    return response.data.dataset;
  } catch (error) {
    console.error('Error creating dataset:', error);
    throw error;
  }
};

const getDatasets = async (page = 1, perPage = 10, options = {}) => {
  try {
    const params = {
      limit: perPage,
    };
    
    if (options.nextCursor) {
      params.next_cursor = options.nextCursor;
    } else if (options.prevCursor) {
      params.prev_cursor = options.prevCursor;
    }
    
    const response = await crocodileApiClient.get('/datasets', {
      params: params
    });
    
    console.log('API Response:', response.data);
    
    // Transform data for compatibility with existing UI
    const transformedData = {
      data: response.data.data.map(ds => ({
        datasetName: ds.dataset_name,
        totalTables: ds.total_tables,
        totalRows: ds.total_rows,
        createdAt: ds.created_at
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(response.data.data.length / perPage) || 1,
        next_cursor: response.data.pagination.next_cursor,
        prev_cursor: response.data.pagination.prev_cursor
      }
    };
    
    return transformedData;
  } catch (error) {
    console.error('Error retrieving datasets:', error);
    throw error;
  }
};

const uploadTable = async (datasetName, file, kgReference="wikidata") => {
  const formData = new FormData();
  formData.append('file', file);
  
  // The API expects table_name as a query parameter, not in the form data
  const tableName = file.name.replace(/\.[^/.]+$/, "");
  
  try {
    // Fix: Use singular "dataset" and "table" in the path as per Crocodile API spec
    const response = await crocodileApiClient.post(`/datasets/${datasetName}/tables/csv`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params: {
        // Add table_name as a query parameter
        table_name: tableName
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error uploading table:', error);
    throw error;
  }
};

const getTables = async (datasetName, page = 1, perPage = 10, options = {}) => {
  try {
    const params = {
      limit: perPage,
    };
    
    if (options.nextCursor) {
      params.next_cursor = options.nextCursor;
    } else if (options.prevCursor) {
      params.prev_cursor = options.prevCursor;
    }
    
    const response = await crocodileApiClient.get(`/datasets/${datasetName}/tables`, {
      params: params
    });
    
    console.log('API Response:', response.data);
    
    // Transform data for compatibility with existing UI
    const transformedData = {
      data: response.data.data.map(table => ({
        tableName: table.table_name,
        totalRows: table.total_rows,
        createdAt: table.created_at,
        status: table.status || 'processing'
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(response.data.data.length / perPage) || 1,
        next_cursor: response.data.pagination.next_cursor,
        prev_cursor: response.data.pagination.prev_cursor
      }
    };
    
    return transformedData;
  } catch (error) {
    console.error('Error retrieving tables:', error);
    throw error;
  }
};

const getTableData = async (datasetName, tableName, page = 1, perPage = 10, options = {}) => {
  try {
    // Support for bi-directional cursor-based pagination
    const params = {
      limit: perPage,
    };
    
    // Add next_cursor or prev_cursor if provided (but not both)
    if (options.nextCursor) {
      params.next_cursor = options.nextCursor;
    } else if (options.prevCursor) {
      params.prev_cursor = options.prevCursor;
    }
    
    const response = await crocodileApiClient.get(`/datasets/${datasetName}/tables/${tableName}`, {
      params: params
    });
    
    console.log('API Response:', response.data);

    // Return the response directly to maintain original format
    return response.data;
  } catch (error) {
    console.error('Error retrieving table data:', error);
    throw error;
  }
};

const deleteDataset = async (datasetName) => {
  try {
    const response = await crocodileApiClient.delete(`/datasets/${datasetName}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting dataset:', error);
    throw error;
  }
};

const deleteTable = async (datasetName, tableName) => {
  try {
    const response = await crocodileApiClient.delete(`/datasets/${datasetName}/tables/${tableName}`);
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
        cache: false
      }
    });
    console.log('LamAPI Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching candidates:', error);
    throw error;
  }
};

export { getDatasets, getTables, getTableData, deleteDataset, deleteTable, fetchCandidates, createDataset, uploadTable};