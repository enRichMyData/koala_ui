import React from 'react';
import { useParams } from 'react-router-dom';
// Import other components and services you need for the detail page

const TableList = () => {
  const { datasetName } = useParams();  // This replaces match.params.id

  // Fetch dataset details using the 'id' variable
  // Render the dataset details

  return (
    <div>
      <h1>Dataset Detail</h1>
      {/* Render dataset details here */}
      <p>Dataset ID: {datasetName}</p>  
    </div>
  );
};

export default TableList;
