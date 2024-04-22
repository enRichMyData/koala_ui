import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getTableData } from '../services/apiServices';
import Modal from './Modal'; // Assume this is your modal component

function TableDataViewer() {
    const { datasetName, tableName } = useParams();
    const [tableData, setTableData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [modalData, setModalData] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const data = await getTableData(datasetName, tableName, currentPage);
                setTableData(data);
            } catch (err) {
                setError(err.message);
                console.error("Failed to fetch table data:", err);
            }
            setLoading(false);
        };

        fetchData();
    }, [datasetName, tableName, currentPage]);

    const handleCellClick = (rowId, colId) => {
        const annotations = tableData.semanticAnnotations.cea.filter(ann => ann.idRow === rowId && ann.idColumn === colId);
        if (annotations.length > 0) {
            setModalData(annotations);
        }
    };

    const hasAnnotations = (rowId, colId) => {
        return tableData.semanticAnnotations.cea.some(ann => ann.idRow === rowId && ann.idColumn === colId);
    };

    if (loading) return <p>Loading...</p>;
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
                                    <th key={index}>{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tableData.rows.map((row, idx) => (
                                <tr key={idx}>
                                    {row.data.map((cell, colIdx) => (
                                        <td key={colIdx} onClick={() => handleCellClick(row.idRow, colIdx)}
                                            style={{ backgroundColor: hasAnnotations(row.idRow, colIdx) ? 'lightgreen' : '' }}>
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {/* Pagination controls */}
                    <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button>
                    <button onClick={() => setCurrentPage(currentPage + 1)}>Next</button>
                </div>
            )}
            {modalData && <Modal data={modalData} onClose={() => setModalData(null)} />}
        </div>
    );
}

export default TableDataViewer;
