import axios from 'axios';

const BACKEND_API_URL = process.env.REACT_APP_BACKEND_URL;
const encodeSegment = (value = '') => encodeURIComponent(value);

const authClient = axios.create({
  baseURL: BACKEND_API_URL
});

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

let isRefreshing = false;
let refreshQueue = [];

const queueRefresh = (callback) => {
  refreshQueue.push(callback);
};

const resolveRefreshQueue = (token) => {
  refreshQueue.forEach(callback => callback(token));
  refreshQueue = [];
};

const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    throw new Error('Missing refresh token');
  }
  const response = await authClient.post('/refresh', {
    refresh_token: refreshToken
  });
  const newAccessToken = response.data?.access_token;
  const newRefreshToken = response.data?.refresh_token;
  if (newAccessToken) {
    localStorage.setItem('token', newAccessToken);
  }
  if (newRefreshToken) {
    localStorage.setItem('refresh_token', newRefreshToken);
  }
  if (response.data?.email) {
    localStorage.setItem('userEmail', response.data.email);
  }
  if (response.data?.role) {
    localStorage.setItem('userRole', response.data.role);
  }
  return newAccessToken;
};

backendApiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (!originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }
    if (originalRequest.url?.includes('/login') || originalRequest.url?.includes('/refresh')) {
      return Promise.reject(error);
    }
    if (error.response?.status === 401) {
      if (isRefreshing) {
        return new Promise(resolve => {
          queueRefresh((token) => {
            if (token) {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(backendApiClient(originalRequest));
          });
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const token = await refreshAccessToken();
        isRefreshing = false;
        resolveRefreshQueue(token);
        if (token) {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return backendApiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        refreshQueue = [];
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userEmail');
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);


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

const uploadTable = async (datasetName, file, columnClassification = null, options = {}) => {
  const resolvedOptions = typeof options === 'boolean'
    ? { autoDetect: options }
    : options;
  const formData = new FormData();
  formData.append('file', file);

  if (columnClassification) {
    formData.append('column_classification', JSON.stringify(columnClassification));
  }
  if (resolvedOptions.autoDetect) {
    formData.append('auto_detect', 'true');
  }
  if (resolvedOptions.llmProvider) {
    formData.append('llm_provider', resolvedOptions.llmProvider);
  }
  if (resolvedOptions.llmModel) {
    formData.append('llm_model', resolvedOptions.llmModel);
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
    sort_by: options.sortBy,
    sort_direction: options.sortDirection
  };
  if (options.sortConfidenceColumn !== undefined && options.sortConfidenceColumn !== null && options.sortConfidenceColumn !== '') {
    params.sort_confidence_column = options.sortConfidenceColumn;
  }

  if (options.nextCursor) {
    params.next_cursor = options.nextCursor;
  } else if (options.prevCursor) {
    params.prev_cursor = options.prevCursor;
  }
  if (options.includeTypes?.length) {
    params.include_types = options.includeTypes;
  }
  if (options.excludeTypes?.length) {
    params.exclude_types = options.excludeTypes;
  }
  if (options.includeNeTypes?.length) {
    params.include_ne_types = options.includeNeTypes;
  }
  if (options.excludeNeTypes?.length) {
    params.exclude_ne_types = options.excludeNeTypes;
  }
  if (options.reconciliationProvider) {
    params.reconciliation_provider = options.reconciliationProvider;
  }

  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}`,
    { params }
  );
  return response.data;
};

const exportTableCsv = async (datasetName, tableName, options = {}) => {
  const params = {};
  if (options.includeReconciliation !== undefined) {
    params.include_reconciliation = options.includeReconciliation;
  }
  if (options.enrichmentFields?.length) {
    params.enrichment_fields = options.enrichmentFields;
  }
  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/export`,
    {
      responseType: 'blob',
      params
    }
  );
  return response;
};

const updateColumnClassification = async (datasetName, tableName, classification) => {
  const response = await backendApiClient.put(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/columns/classification`,
    { classification }
  );
  return response.data;
};

const requestColumnIdentification = async (datasetName, tableName, options = {}) => {
  const params = {};
  if (options.llmProvider) {
    params.llm_provider = options.llmProvider;
  }
  if (options.llmModel) {
    params.llm_model = options.llmModel;
  }
  if (options.force) {
    params.force = true;
  }
  const response = await backendApiClient.post(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/columns/identify`,
    null,
    { params }
  );
  return response.data;
};

const requestDpvAnnotation = async (datasetName, tableName, options = {}) => {
  const params = {};
  if (options.llmProvider) {
    params.llm_provider = options.llmProvider;
  }
  if (options.llmModel) {
    params.llm_model = options.llmModel;
  }
  const response = await backendApiClient.post(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/columns/dpv/annotate`,
    null,
    { params }
  );
  return response.data;
};

const getColumnIdentifyStatus = async (datasetName, tableName) => {
  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/columns/identify/status`
  );
  return response.data;
};

const getDpvStatus = async (datasetName, tableName) => {
  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/columns/dpv/status`
  );
  return response.data;
};

const getLlmSettings = async () => {
  const response = await backendApiClient.get('/users/me/llm-settings');
  return response.data;
};

const updateLlmSettings = async (settings = {}) => {
  const response = await backendApiClient.put('/users/me/llm-settings', settings);
  return response.data;
};

const getReconciliationSettings = async () => {
  const response = await backendApiClient.get('/users/me/reconciliation-settings');
  return response.data;
};

const updateReconciliationSettings = async (settings = {}) => {
  const response = await backendApiClient.put('/users/me/reconciliation-settings', settings);
  return response.data;
};

const getCurrentUser = async () => {
  const response = await backendApiClient.get('/users/me');
  return response.data;
};

const getAdminUsers = async () => {
  const response = await backendApiClient.get('/admin/users');
  return response.data;
};

const createAdminUser = async (payload = {}) => {
  const response = await backendApiClient.post('/admin/users', payload);
  return response.data;
};

const updateAdminUser = async (email, payload = {}) => {
  const response = await backendApiClient.put(`/admin/users/${encodeSegment(email)}`, payload);
  return response.data;
};

const deleteAdminUser = async (email) => {
  const response = await backendApiClient.delete(`/admin/users/${encodeSegment(email)}`);
  return response.data;
};

const createReconciliationJob = async (datasetName, tableName, payload = {}) => {
  const response = await backendApiClient.post(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/reconcile`,
    payload
  );
  return response.data;
};

const getReconciliationStatus = async (datasetName, tableName, jobId) => {
  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/reconcile/${jobId}/status`
  );
  return response.data;
};

const triggerReconciliationColumnTypes = async (datasetName, tableName, payload = {}) => {
  const response = await backendApiClient.post(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/reconcile/column-types`,
    payload
  );
  return response.data;
};

const getReconciliationColumnTypes = async (datasetName, tableName, options = {}) => {
  const params = {};
  if (options.provider) {
    params.provider = options.provider;
  }
  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/reconcile/column-types`,
    { params }
  );
  return response.data;
};

const getReconciliationCandidates = async (datasetName, tableName, row, col, provider) => {
  const response = await backendApiClient.get(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/reconcile/candidates`,
    { params: { row, col, provider } }
  );
  return response.data;
};

const updateReconciliationCell = async (datasetName, tableName, payload = {}) => {
  const response = await backendApiClient.put(
    `/datasets/${encodeSegment(datasetName)}/tables/${encodeSegment(tableName)}/reconcile/cell`,
    payload
  );
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
  exportTableCsv,
  updateColumnClassification,
  requestColumnIdentification,
  requestDpvAnnotation,
  getColumnIdentifyStatus,
  getDpvStatus,
  getLlmSettings,
  updateLlmSettings,
  getReconciliationSettings,
  updateReconciliationSettings,
  getCurrentUser,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  createReconciliationJob,
  getReconciliationStatus,
  triggerReconciliationColumnTypes,
  getReconciliationColumnTypes,
  getReconciliationCandidates,
  updateReconciliationCell
};
