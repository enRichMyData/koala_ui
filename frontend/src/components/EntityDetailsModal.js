import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, Table, TableBody, TableCell, TableHead, TableRow, Button, DialogActions, Link } from '@mui/material';

function EntityDetailsModal({ data, onClose }) {
    const [selectedWinnerIndex, setSelectedWinnerIndex] = useState(null);

    useEffect(() => {
        let foundWinner = false;
        data.forEach((ann, index) => {
            if (ann.match && !foundWinner) {
                setSelectedWinnerIndex(`${index}`);
                foundWinner = true;
            }
        });
    }, [data]);

    const toggleWinner = (id) => {
        setSelectedWinnerIndex(selectedWinnerIndex === id ? null : id);
    };

    return (
        <Dialog open={true} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Semantic Details</DialogTitle>
            <DialogContent>
                <Table>
                    <TableHead>
                        <TableRow>
                            <th>#</th>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Score</th>
                            <th>Winner</th>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((ann, index) => (
                            <TableRow key={index} selected={selectedWinnerIndex === `${index}`}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>
                                    {ann.id ? <Link href={`https://www.wikidata.org/wiki/${ann.id}`} target="_blank">{ann.name}</Link> : ann.name}
                                </TableCell>
                                <TableCell>{ann.type.map(t => t.name).join(', ')}</TableCell>
                                <TableCell>{ann.description}</TableCell>
                                <TableCell>{ann.score.toFixed(3)}</TableCell>
                                <TableCell>
                                    <Button
                                        variant={selectedWinnerIndex === `${index}` ? "contained" : "outlined"}
                                        color="primary"
                                        onClick={() => toggleWinner(`${index}`)}
                                    >
                                        {selectedWinnerIndex === `${index}` ? 'Selected' : 'Select'}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="primary">Close</Button>
            </DialogActions>
        </Dialog>
    );
}

export default EntityDetailsModal;
