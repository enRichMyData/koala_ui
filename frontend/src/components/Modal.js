import React, { useEffect, useState } from 'react';
import './Modal.css'; // Make sure to import the CSS file

function Modal({ data, onClose }) {
    const [selectedWinnerIndex, setSelectedWinnerIndex] = useState(null);

    useEffect(() => {
        let foundWinner = false;
        data.forEach((ann, index) => {
            ann.entity.forEach((ent, idx) => {
                if (ent.match && !foundWinner) {
                    setSelectedWinnerIndex(`${index}-${idx}`);
                    foundWinner = true;
                }
            });
        });
    }, [data]);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

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
                                {/* Check for QID and render link if available */}
                                <td>{ent.id ? <a href={`https://www.wikidata.org/wiki/${ent.id}`} target="_blank" rel="noopener noreferrer">{ent.name}</a> : ent.name}</td>
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
