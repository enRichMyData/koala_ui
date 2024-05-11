import React from 'react';

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  return (
    <div>
      <button onClick={handlePrevious} disabled={currentPage === 1}>Previous</button>
      <span>Page {currentPage} of {totalPages}</span>
      <button onClick={handleNext} disabled={currentPage >= totalPages}>Next</button>
    </div>
  );
};

export default Pagination;
