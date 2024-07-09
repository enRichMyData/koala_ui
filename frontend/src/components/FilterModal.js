import React, { useState } from 'react';
import { Modal, Box, Button, Checkbox, FormControlLabel, Radio, RadioGroup, FormControl, FormLabel, Typography, Link } from '@mui/material';

const modalStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 500,
    bgcolor: 'background.paper',
    border: '2px solid #000',
    boxShadow: 24,
    p: 4,
    maxHeight: '80vh',
    overflowY: 'auto',
};

const FilterModal = ({ open, onClose, ctaTypes, columnIndex, applyFilter }) => {
    const [selectedTypes, setSelectedTypes] = useState({});
    const [mode, setMode] = useState('include');

    const handleTypeChange = (type) => {
        setSelectedTypes(prev => ({
            ...prev,
            [type.id]: !prev[type.id] ? type.name : null,
        }));
    };

    const handleApply = () => {
        applyFilter(columnIndex, selectedTypes, mode);
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={modalStyle}>
                <Typography variant="h6" gutterBottom>
                    Filter Types
                </Typography>
                {ctaTypes.map(type => (
                    <Box key={type.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={!!selectedTypes[type.id]}
                                    onChange={() => handleTypeChange(type)}
                                />
                            }
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Link href={`https://www.wikidata.org/wiki/${type.id}`} target="_blank" rel="noopener" underline="hover" sx={{ mr: 1 }}>
                                        {type.name}
                                    </Link>
                                    <Typography variant="body2" color="textSecondary">
                                        (ID: {type.id}, Score: {type.score})
                                    </Typography>
                                </Box>
                            }
                        />
                    </Box>
                ))}
                <FormControl component="fieldset" sx={{ mt: 2 }}>
                    <FormLabel component="legend">Filter Mode</FormLabel>
                    <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value)}>
                        <FormControlLabel value="include" control={<Radio />} label="Include" />
                        <FormControlLabel value="exclude" control={<Radio />} label="Exclude" />
                    </RadioGroup>
                </FormControl>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                    <Button onClick={onClose} color="secondary" sx={{ mr: 1 }}>
                        Cancel
                    </Button>
                    <Button onClick={handleApply} color="primary" variant="contained">
                        Apply Filter
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default FilterModal;