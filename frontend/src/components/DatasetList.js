import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDatasets } from '../services/apiServices';
import Pagination from './Pagination';  // Import the Pagination component

const DatasetList = () => {
  const [datasets, setDatasets] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const response = await getDatasets(currentPage);
        if (response.data && response.data.length > 0) {
          setDatasets(response.data);
          setError('');
        } else {
          setDatasets([]);
        }
        setTotalPages(response.pagination.totalPages);
        setCurrentPage(response.pagination.currentPage);
      } catch (error) {
        setError(`Failed to fetch datasets: ${error.message}`);
        setDatasets([]);
      }
    };

    fetchDatasets();
  }, [currentPage]);

  const onPageChange = (page) => {
    setCurrentPage(page);
  };

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h1>Dataset List</h1>
      {datasets.length > 0 ? (
        <ul>
          {datasets.map((dataset, index) => (
            <li key={index}>
              <Link to={`/dataset/${dataset.datasetName}`}>{dataset.datasetName}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>No datasets found</p>
      )}
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
};

export default DatasetList;
