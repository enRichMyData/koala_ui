import axios from 'axios';

const BACKEND_API_URL = process.env.REACT_APP_BACKEND_URL;
const LAMAPI_URL = process.env.REACT_APP_LAMAPI_URL;
const LAMAPI_TOKEN = process.env.REACT_APP_LAMAPI_TOKEN;

const encodeSegment = (value = '') => encodeURIComponent(value);

const backendApiClient = axios.create({
  baseURL: BACKEND_API_URL
});

backendApiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (config.params) {
    const params = new URLSearchParams();
    Object.entries(config.params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (item !== undefined && item !== null) {
            params.append(key, item);
          }
        });
      } else if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    config.paramsSerializer = () => params.toString();
  }
  return config;
});

const lamapiClient = axios.create({
  baseURL: LAMAPI_URL,
});

lamapiClient.interceptors.request.use(config => {
  config.params = config.params || {};
  config.params.token = LAMAPI_TOKEN;
  return config;
});

const buildPaginationParams = (page, perPage, options = {}) => {
  const params = {
    page,
    per_page: perPage
  };
  if (options.nextCursor) {
    params.next_cursor = options.nextCursor;
  } else if (options.prevCursor) {
    params.prev_cursor = options.prevCursor;
  }
  return params;
};

const createDataset = async (datasetName) => {
  const response = await backendApiClient.post('/datasets', {
    dataset_name: datasetName
  });
  return response.data;
};

const getDatasets = async (page = 1, perPage = 10, options = {}) => {
  const params = buildPaginationParams(page, perPage, options);
  const response = await backendApiClient.get('/datasets', { params });
  return response.data;
};

const deleteDataset = async (datasetName) => {
  const response = await backendApiClient.delete(`/datasets/${encodeSegment(datasetName)}`);
  return response.data;
};

const uploadTable = async (datasetName, file, columnClassification = null) => {
  const formData = new FormData();
  formData.append('file', file);

  if (columnClassification) {
    formData.append('column_classification', JSON.stringify(columnClassification));
  }

  const response = await backendApiClient.post(
    `/datasets/${encodeSegment(datasetName)}/tables/upload`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
};

const getTables = async (datasetName, page = 1, perPage = 10, options = {}) => {
  const params = buildPaginationParams(page, perPage, options);
  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables`,
    { params }
  );
  return response.data;
};

const deleteTable = async (datasetName, tableName) => {
  const response = await backendApiClient.delete(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}`
  );
  return response.data;
};

const getTableData = async (datasetName, tableName, perPage = 10, options = {}) => {
  const params = {
    per_page: perPage,
    page: options.page || 1,
    search: options.search,
    column: options.column,
    sort_by: options.sortBy,
    sort_direction: options.sortDirection
  };

  if (options.nextCursor) {
    params.next_cursor = options.nextCursor;
  } else if (options.prevCursor) {
    params.prev_cursor = options.prevCursor;
  }
  if (options.searchColumns?.length) {
    params.search_columns = options.searchColumns;
  }
  if (options.includeTypes?.length) {
    params.include_types = options.includeTypes;
  }
  if (options.excludeTypes?.length) {
    params.exclude_types = options.excludeTypes;
  }

  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}`,
    { params }
  );
  return response.data;
};

const getTableStatus = async (datasetName, tableName) => {
  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/status`
  );
  return response.data;
};

const exportTableCsv = async (datasetName, tableName, fields = []) => {
  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/export`,
    {
      params: { fields },
      responseType: 'blob'
    }
  );
  return response;
};

const runLinkingTask = async (datasetName, tableName, payload) => {
  const response = await backendApiClient.post(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/linking`,
    payload
  );
  return response.data;
};

const updateAnnotation = async (datasetName, tableName, rowId, columnId, entityData) => {
  const requestBody = {
    entity_id: entityData.id,
    match: entityData.match ?? true,
    score: entityData.score ?? 1,
    notes: entityData.notes ?? '',
    candidate_info: {
      id: entityData.id,
      name: entityData.name || '',
      description: entityData.description || '',
      types: entityData.types || [],
      source: entityData.source || 'manual'
    },
    candidates: entityData.candidates || null
  };

  const response = await backendApiClient.put(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/rows/${rowId}/columns/${columnId}`,
    requestBody
  );
  return response.data;
};

const deleteAnnotation = async (datasetName, tableName, rowId, columnId, entityId) => {
  const response = await backendApiClient.delete(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/rows/${rowId}/columns/${columnId}/candidates/${entityId}`
  );
  return response.data;
};

const fetchCandidates = async (query, options = {}) => {
  const params = {
    name: query,
    limit: options.limit || 100,
    kg: 'wikidata',
    cache: false
  };

  if (options.kind) params.kind = options.kind;
  if (options.ner_type) params.ner_type = options.ner_type;
  if (options.types) params.types = options.types;

  const response = await lamapiClient.get('/lookup/entity-retrieval', { params });
  return response.data;
};

const fetchEntityTypes = async (query) => {
  const response = await lamapiClient.get('/lookup/entity-retrieval', {
    params: {
      name: query,
      limit: 50,
      kg: 'wikidata',
      cache: false,
      kind: 'type'
    }
  });
  return response.data;
};

export {
  createDataset,
  getDatasets,
  deleteDataset,
  uploadTable,
  getTables,
  deleteTable,
  getTableData,
  getTableStatus,
  exportTableCsv,
  runLinkingTask,
  updateAnnotation,
  deleteAnnotation,
  fetchCandidates,
  fetchEntityTypes
};
