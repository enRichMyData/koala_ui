import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDatasets } from '../services/apiServices';

const DatasetList = () => {
  const [datasets, setDatasets] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(true); // Assume more pages initially

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const data = await getDatasets(currentPage);
        if (data && data.length > 0) {  // If data is returned and not empty
          setDatasets(data);
          setHasMorePages(true); // Assume there might be more pages
        } else if (data && data.length === 0) { // If data is empty, no more pages
          setHasMorePages(false);
          setError('No more datasets available'); // Optionally set an error or info message
        } else {
          setError('No data returned from API');
        }
      } catch (error) {
        setError(`Failed to fetch datasets: ${error.message}`);
      }
    };

    fetchDatasets();
  }, [currentPage]);

  const handlePrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
      setHasMorePages(true); // Resetting in case it was set to false
    }
  };

  const handleNext = () => {
    if (hasMorePages) {
      setCurrentPage(prev => prev + 1);
    }
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
      <div>
        <button onClick={handlePrevious} disabled={currentPage === 1}>Previous</button>
        <span>Page {currentPage} {hasMorePages ? "" : " (Last Page)"}</span>
        <button onClick={handleNext} disabled={!hasMorePages}>Next</button>
      </div>
    </div>
  );
};

export default DatasetList;
