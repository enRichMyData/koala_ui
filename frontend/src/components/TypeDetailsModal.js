import React from 'react';
import { Box, Typography, Button, Modal } from '@mui/material';

const TypeDetailsModal = ({ data, open, onClose }) => {
    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{ p: 4, backgroundColor: 'white', borderRadius: 2, maxWidth: '80%', margin: 'auto', marginTop: '5%' }}>
                <Typography variant="h6" gutterBottom>CTA Types</Typography>
                {data && data.map((type, idx) => (
                    <Box key={idx} sx={{ mb: 2 }}>
                        <Typography variant="body1">
                            <a href={`https://www.wikidata.org/wiki/${type.id}`} target="_blank" rel="noopener noreferrer">
                                {type.name}
                            </a>
                            {' '} (ID: {type.id}) - Score: {type.score}
                        </Typography>
                    </Box>
                ))}
                <Button onClick={onClose} variant="contained" color="primary">Close</Button>
            </Box>
        </Modal>
    );
};

export default TypeDetailsModal;