function Modal({ data, onClose }) {
    return (
        <div className="modal">
            <div className="modal-content">
                <span className="close" onClick={onClose}>&times;</span>
                <h2>Semantic Details</h2>
                {data.map((ann, index) => (
                    <div key={index}>
                        <h3>Annotation {index + 1}</h3>
                        {ann.entity.map((ent, idx) => (
                            <div key={idx}>
                                <p><strong>Name:</strong> {ent.name}</p>
                                <p><strong>Type:</strong> {ent.type.map(t => t.name).join(', ')}</p>
                                <p><strong>Description:</strong> {ent.description}</p>
                                <p><strong>Match:</strong> {ent.match ? "Yes" : "No"}</p>
                                <p><strong>Score:</strong> {ent.score}</p>
                                {/* Render other details as needed */}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Modal;