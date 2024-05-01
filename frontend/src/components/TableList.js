import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTables } from '../services/apiServices'; 

const TableList = () => {
  const { datasetName } = useParams();
  const [tables, setTables] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(true); // Assume there might be more pages initially

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const encodedName = encodeURIComponent(datasetName);
        const data = await getTables(encodedName, currentPage); // Assumes getTables accepts dataset name and page number
        if (data && data.length > 0) {
          setTables(data);
        } else if (data && data.length === 0) {
          setHasMorePages(false); // No more data available
          if (currentPage > 1) {
            setError('No more tables available on this page.');
          } else {
            setError('No tables found for this dataset.');
          }
        }
      } catch (error) {
        console.error('Failed to fetch tables:', error);
        setError('Failed to fetch tables');
      }
    };

    fetchTables();
  }, [datasetName, currentPage]);

  const handlePrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
      setHasMorePages(true); // Assume there might be more data until confirmed otherwise
      setError(''); // Clear any error messages
    }
  };

  const handleNext = () => {
    if (hasMorePages) {
      setCurrentPage(prev => prev + 1);
      setError(''); // Clear any error messages
    }
  };

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h1>Tables in Dataset: {datasetName}</h1>
      {tables.length > 0 ? (
        <ul>
          {tables.map((table, index) => (
            <li key={index}>
              <Link to={`/dataset/${encodeURIComponent(datasetName)}/table/${table.tableName}`}>
                {table.tableName}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>{error}</p> // Show an error or a no data message depending on the state
      )}
      <div>
        <button onClick={handlePrevious} disabled={currentPage === 1}>Previous</button>
        <span>Page {currentPage} {hasMorePages ? "" : " (Last Page)"}</span>
        <button onClick={handleNext} disabled={!hasMorePages}>Next</button>
      </div>
    </div>
  );
};

export default TableList;
