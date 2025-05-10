import axios from 'axios';
import * as jose from 'jose';

const CROCODILE_API_URL = process.env.REACT_APP_CROCODILE_URL;
const CROCODILE_SECRET = process.env.REACT_APP_CROCODILE_SECRET || 'secret';
const LAMAPI_URL = process.env.REACT_APP_LAMAPI_URL;
const LAMAPI_TOKEN = process.env.REACT_APP_LAMAPI_TOKEN;

// Helper function to get user email or ID from localStorage
const getUserEmail = () => {
  // First try to get the actual email from localStorage
  const email = localStorage.getItem('userEmail');
  if (email) return email;
  
  // Fall back to userId if email is not available
  return localStorage.getItem('userId') || 'default_user'; 
};

// Helper function to generate a JWT token with jose
const generateCrocodileToken = async () => {
  const encoder = new TextEncoder();
  // Use email as the key in the payload to match what Crocodile expects
  const payload = { email: getUserEmail() };
  
  // Convert the secret to a Uint8Array
  const secretKey = encoder.encode(CROCODILE_SECRET);
  
  // Sign the token with the HS256 algorithm
  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')  // Token expires in 1 hour
    .sign(secretKey);
  
  return token;
};

// Crocodile API Client
const crocodileApiClient = axios.create({
  baseURL: CROCODILE_API_URL,
});

// Add a custom params serializer to handle arrays correctly
crocodileApiClient.interceptors.request.use(config => {
  // If there are array parameters that need repeating (like include_types, exclude_types)
  if (config.params) {
    const newParams = new URLSearchParams();
    
    Object.entries(config.params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        // For arrays, add each value with the same key
        value.forEach(item => {
          newParams.append(key, item);
        });
      } else if (value !== undefined && value !== null) {
        // For non-arrays, just add the parameter
        newParams.append(key, value);
      }
    });
    
    // Replace the serialized params string in the URL
    config.paramsSerializer = () => newParams.toString();
  }
  return config;
});

// Add auth token to every Crocodile API request
crocodileApiClient.interceptors.request.use(async config => {
  try {
    const token = await generateCrocodileToken();
    config.headers.Authorization = `Bearer ${token}`;
  } catch (error) {
    console.error('Error generating token:', error);
  }
  return config;
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
      params: { user_id: getUserEmail() }
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
      user_id: getUserEmail()
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
        totalPages: null, // Total pages cannot be determined with cursor-based pagination
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

const uploadTable = async (datasetName, file, columnClassification = null) => {
  const formData = new FormData();
  formData.append('file', file);
  
  // The API expects table_name as a query parameter, not in the form data
  const tableName = file.name.replace(/\.[^/.]+$/, "");
  
  // Add column classification if provided
  if (columnClassification) {
    formData.append('column_classification', JSON.stringify(columnClassification));
  }
  
  try {
    const response = await crocodileApiClient.post(`/datasets/${datasetName}/tables/csv`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params: {
        table_name: tableName,
        user_id: getUserEmail()
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
      user_id: getUserEmail()
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
      user_id: getUserEmail()
    };
    
    // Add next_cursor or prev_cursor if provided (but not both)
    if (options.nextCursor) {
      params.next_cursor = options.nextCursor;
    } else if (options.prevCursor) {
      params.prev_cursor = options.prevCursor;
    }
    
    // Add search parameters if provided
    if (options.search) {
      params.search = options.search;
    }
    
    // Add column parameter if provided
    if (options.column !== undefined && options.column !== null) {
      params.column = options.column;
    }
    
    // Add search_columns if provided
    if (options.searchColumns && options.searchColumns.length > 0) {
      params.search_columns = options.searchColumns;
    }
    
    // Simplified handling for type filtering parameters
    if (options.includeTypes && options.includeTypes.length > 0) {
      params.include_types = options.includeTypes;
    }
    
    if (options.excludeTypes && options.excludeTypes.length > 0) {
      params.exclude_types = options.excludeTypes;
    }
    
    // Add sorting parameters
    if (options.sortBy) {
      params.sort_by = options.sortBy;
    }
    
    if (options.sortDirection) {
      params.sort_direction = options.sortDirection;
    }
    
    console.log('Sending params:', params);
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
      params: { user_id: getUserEmail() }
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
      params: { user_id: getUserEmail() }
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
        params: { user_id: getUserEmail() }
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
        params: { user_id: getUserEmail() }
      }
    );
    console.log(`Successfully deleted entity ${entityId} from ${datasetName}/${tableName}, row ${rowId}, column ${columnId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting annotation:', error);
    throw error;
  }
};

// Streaming status fetcher for table progress
const getTableStatus = async (datasetName, tableName, onProgress) => {
  // onProgress: function to call with each progress update (parsed JSON)
  const CROCODILE_API_URL = process.env.REACT_APP_CROCODILE_URL;
  const url = `${CROCODILE_API_URL.replace(/\/$/, '')}/datasets/${encodeURIComponent(datasetName)}/tables/${encodeURIComponent(tableName)}/status`;

  // Get a fresh JWT token for the request
  const token = await generateCrocodileToken();

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'accept': 'application/json, text/event-stream'
    }
  });

  if (!response.body) throw new Error('No response body for streaming status');

  const reader = response.body.getReader();
  let buffer = '';
  let done = false;

  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buffer += new TextDecoder().decode(value);

    // Split by newlines (SSE events are separated by \n\n)
    let parts = buffer.split('\n\n');
    buffer = parts.pop(); // last part may be incomplete

    for (const part of parts) {
      // Each event: look for "data: {json}"
      const match = part.match(/^data:\s*(.*)$/m);
      if (match) {
        try {
          const json = JSON.parse(match[1]);
          if (onProgress) onProgress(json.data || json);
          if ((json.data && json.data.status === 'DONE') || json.status === 'DONE') {
            done = true;
            break;
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }
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
  uploadTable,
  getTableStatus
};