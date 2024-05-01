import React, { useEffect, useState } from 'react';
import './Modal.css'; // Make sure to import the CSS file

function Modal({ data, onClose }) {
    // State to keep track of the selected winner, initialized based on 'match'
    const [selectedWinnerIndex, setSelectedWinnerIndex] = useState(null);

    useEffect(() => {
        // Find index of the initial winner based on 'match'
        let foundWinner = false;
        data.forEach((ann, index) => {
            ann.entity.forEach((ent, idx) => {
                if (ent.match && !foundWinner) {
                    setSelectedWinnerIndex(`${index}-${idx}`);
                    foundWinner = true;  // Ensure only the first match is set as winner initially
                }
            });
        });
    }, [data]);

    // Prevent scrolling on the background when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    // Function to toggle the winner status
    const toggleWinner = (id) => {
        setSelectedWinnerIndex(selectedWinnerIndex === id ? null : id);
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <span className="close" onClick={onClose}>&times;</span>
                <h2>Semantic Details</h2>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Score</th>
                            <th>Winner</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((ann, index) => ann.entity.map((ent, idx) => (
                            <tr key={`${index}-${idx}`}>
                                <td>{index + 1}</td>
                                <td>{ent.name}</td>
                                <td>{ent.type ? ent.type.map(t => t.name).join(', ') : 'N/A'}</td>
                                <td>{ent.description}</td>
                                <td>{ent.score}</td>
                                <td>
                                    <span
                                        className={`winner-indicator ${selectedWinnerIndex === `${index}-${idx}` ? 'green' : 'yellow'}`}
                                        onClick={() => toggleWinner(`${index}-${idx}`)}
                                    ></span>
                                </td>
                            </tr>
                        )))}
                    </tbody>
                </table>
                <button className="modal-close-btn" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}

export default Modal;
