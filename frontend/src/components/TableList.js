import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTables } from '../services/apiServices'; // You need to implement this function

const TableList = () => {
  const { datasetName } = useParams();
  const [tables, setTables] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const encodedName = encodeURIComponent(datasetName);
        const data = await getTables(encodedName); // Assumes getTables accepts dataset name
        setTables(data);
      } catch (error) {
        console.error('Failed to fetch tables:', error);
        setError('Failed to fetch tables');
      }
    };

    fetchTables();
  }, [datasetName]);

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
        <p>No tables found for this dataset.</p>
      )}
    </div>
  );
};

export default TableList;
