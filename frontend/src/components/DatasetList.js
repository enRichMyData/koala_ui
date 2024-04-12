import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDatasets } from '../services/apiServices';

const DatasetList = () => {
  const [datasets, setDatasets] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const data = await getDatasets();
        setDatasets(data);
      } catch (error) {
        setError('Failed to fetch datasets');
        // More error handling can be done here depending on the needs
      }
    };

    fetchDatasets();
  }, []);

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
    </div>
  );
};

export default DatasetList;
