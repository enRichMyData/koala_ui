import axios from 'axios';

const CROCODILE_API_URL = process.env.REACT_APP_CROCODILE_URL;
const LAMAPI_URL = process.env.REACT_APP_LAMAPI_URL;
const LAMAPI_TOKEN = process.env.REACT_APP_LAMAPI_TOKEN;

// Helper function to get user ID from localStorage
const getUserId = () => {
  return localStorage.getItem('userId') || 'default_user'; 
};

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
    }, {
      params: { user_id: getUserId() }
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
      user_id: getUserId()
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
    const response = await crocodileApiClient.post(`/datasets/${datasetName}/tables/csv`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params: {
        table_name: tableName,
        user_id: getUserId()
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
      user_id: getUserId()
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

const getTableData = async (datasetName, tableName, perPage = 10, options = {}) => {
  try {
    // Support for cursor-based pagination
    const params = {
      limit: perPage,
      user_id: getUserId()
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
    const response = await crocodileApiClient.delete(`/datasets/${datasetName}`, {
      params: { user_id: getUserId() }
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting dataset:', error);
    throw error;
  }
};

const deleteTable = async (datasetName, tableName) => {
  try {
    const response = await crocodileApiClient.delete(`/datasets/${datasetName}/tables/${tableName}`, {
      params: { user_id: getUserId() }
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting table:', error);
    throw error;
  }
};

// Enhanced LamAPI function
const fetchCandidates = async (query, options = {}) => {
  try {
    const params = {
      name: query,
      limit: options.limit || 100,
      kg: 'wikidata',
      cache: false // Always set cache to false as required
    };
    
    // Add optional parameters if provided
    if (options.kind) params.kind = options.kind;
    if (options.ner_type) params.ner_type = options.ner_type;
    if (options.types) params.types = options.types;
  
    console.log('Fetching candidates with params:', params);
    // Make the API call to LamAPI
    const response = await lamapiClient.get('/lookup/entity-retrieval', {
      params: params
    });
    console.log('LamAPI Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching candidates:', error);
    throw error;
  }
};

// Function to search for entity types (to get QIDs for types)
const fetchEntityTypes = async (query) => {
  try {
    const response = await lamapiClient.get('/lookup/entity-retrieval', {
      params: {
        name: query,
        limit: 50,
        kg: 'wikidata',
        cache: false,
        kind: 'type' // Request types specifically
      }
    });
    console.log('Entity Types Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching entity types:', error);
    throw error;
  }
};

// Function to update an annotation with the correct endpoint
const updateAnnotation = async (datasetName, tableName, rowId, columnId, entityData) => {
  try {
    // Format the request based on the required schema
    const requestBody = {
      entity_id: entityData.id,
      match: true,
      score: entityData.score || 1,
      notes: "",
      candidate_info: {
        id: entityData.id,
        name: entityData.name || "",
        description: entityData.description || "",
        types: entityData.types || []
      }
    };

    console.log(`Updating annotation for ${datasetName}/${tableName}, row ${rowId}, column ${columnId}`, requestBody);
    
    // Use the row/column specific endpoint
    const response = await crocodileApiClient.put(
      `/datasets/${datasetName}/tables/${tableName}/rows/${rowId}/columns/${columnId}`,
      requestBody,
      {
        params: { user_id: getUserId() }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error updating annotation:', error);
    throw error;
  }
};

// Function to delete a specific entity from cell annotations
const deleteAnnotation = async (datasetName, tableName, rowId, columnId, entityId) => {
  try {
    // Using the RESTful endpoint structure for deleting a specific entity
    const response = await crocodileApiClient.delete(
      `/datasets/${datasetName}/tables/${tableName}/rows/${rowId}/columns/${columnId}/candidates/${entityId}`,
      {
        params: { user_id: getUserId() }
      }
    );
    console.log(`Successfully deleted entity ${entityId} from ${datasetName}/${tableName}, row ${rowId}, column ${columnId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting annotation:', error);
    throw error;
  }
};

export { 
  getDatasets, 
  getTables, 
  getTableData, 
  deleteDataset, 
  deleteTable, 
  fetchCandidates, 
  fetchEntityTypes,
  updateAnnotation,
  deleteAnnotation,
  createDataset, 
  uploadTable
};