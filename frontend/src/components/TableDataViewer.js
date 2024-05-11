import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getTableData } from '../services/apiServices';
import Modal from './Modal';
import Pagination from './Pagination'; // Import the Pagination component
import './TableDataViewer.css'; 

function TableDataViewer() {
    const { datasetName, tableName } = useParams();
    const [tableData, setTableData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [modalData, setModalData] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await getTableData(datasetName, tableName, currentPage);
                setTableData(response.data);
                setTotalPages(response.pagination.totalPages); // Assuming API provides total pages
            } catch (err) {
                setError(err.message);
                console.error("Failed to fetch table data:", err);
            }
            setLoading(false);
        };

        fetchData();
    }, [datasetName, tableName, currentPage, sortConfig]);

    const handleCellClick = (rowId, colId) => {
        const annotations = tableData.semanticAnnotations.cea.filter(ann => ann.idRow === rowId && ann.idColumn === colId);
        if (annotations.length > 0) {
            setModalData(annotations);
        }
    };

    const handleSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const hasAnnotations = (rowId, colId) => {
        return tableData.semanticAnnotations.cea.some(ann => ann.idRow === rowId && ann.idColumn === colId);
    };

    if (loading) return <div className="loader">Loading...</div>;
    if (error) return <p>Error loading table data: {error}</p>;

    return (
        <div>
            <h1>Table Data: {tableName}</h1>
            {tableData && (
                <div>
                    <table>
                        <thead>
                            <tr>
                                {tableData.header.map((header, index) => (
                                    <th key={index} onClick={() => handleSort(header)}>{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tableData.rows.map((row, idx) => (
                                <tr key={idx}>
                                    {row.data.map((cell, colIdx) => (
                                        <td key={colIdx} onClick={() => handleCellClick(row.idRow, colIdx)}
                                            className={hasAnnotations(row.idRow, colIdx) ? 'annotated' : ''}>
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                </div>
            )}
            {modalData && <Modal data={modalData} onClose={() => setModalData(null)} />}
        </div>
    );
}

export default TableDataViewer;
