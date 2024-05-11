// TableList.js
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTables } from '../services/apiServices';
import Pagination from './Pagination'; // Make sure to import the Pagination component

const TableList = () => {
  const { datasetName } = useParams();
  const [tables, setTables] = useState([]);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0); // You need to manage total pages

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const encodedName = encodeURIComponent(datasetName);
        const response = await getTables(encodedName, currentPage); // Update API to return response with data and pagination info
        if (response.data && response.data.length > 0) {
          setTables(response.data);
          setTotalPages(response.pagination.totalPages); // Assume pagination info is part of the response
          setError('');
        } else {
          setTables([]);
          setError('No tables found for this dataset.');
        }
      } catch (error) {
        console.error('Failed to fetch tables:', error);
        setError('Failed to fetch tables');
      }
    };

    fetchTables();
  }, [datasetName, currentPage]);

  const onPageChange = (page) => {
    setCurrentPage(page);
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
        <p>No tables found</p>
      )}
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
};

export default TableList;
