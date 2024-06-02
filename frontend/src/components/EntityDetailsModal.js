import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, Table, TableBody, TableCell, TableHead, TableRow, Button, DialogActions, Link, TextField, CircularProgress, List, ListItem, ListItemText, Typography, Checkbox } from '@mui/material';
import { fetchCandidates } from '../services/apiServices'; // Ensure the correct path

function EntityDetailsModal({ data, onClose }) {
    const [selectedWinnerIndex, setSelectedWinnerIndex] = useState(null);
    const [query, setQuery] = useState('');
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedCandidates, setSelectedCandidates] = useState([]);
    const [checkedCandidates, setCheckedCandidates] = useState([]);

    useEffect(() => {
        let foundWinner = false;
        data.forEach((ann, index) => {
            if (ann.match && !foundWinner) {
                setSelectedWinnerIndex(`${index}`);
                foundWinner = true;
            }
        });
    }, [data]);

    useEffect(() => {
        const fetchData = async () => {
            if (query.length > 2) { // Start searching when query length is greater than 2
                setLoading(true);
                try {
                    const responseData = await fetchCandidates(query);
                    setCandidates(responseData);
                } catch (err) {
                    setError(err.message);
                } finally {
                    setLoading(false);
                }
            } else {
                setCandidates([]);
            }
        };

        const debounceFetch = setTimeout(fetchData, 300); // Debounce to avoid too many requests
        return () => clearTimeout(debounceFetch); // Clean up the timeout on component unmount or query change
    }, [query]);

    const toggleWinner = (id) => {
        setSelectedWinnerIndex(selectedWinnerIndex === id ? null : id);
    };

    const handleCandidateCheck = (candidate) => {
        setCheckedCandidates((prevChecked) => {
            if (prevChecked.includes(candidate)) {
                return prevChecked.filter((c) => c.id !== candidate.id);
            } else {
                return [...prevChecked, candidate];
            }
        });
    };

    const handleConfirmSelection = () => {
        setSelectedCandidates(checkedCandidates);
        setCheckedCandidates([]);
        setCandidates([]);
        setQuery('');
    };

    return (
        <Dialog open={true} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Semantic Details</DialogTitle>
            <DialogContent>
                <TextField
                    label="Search for candidates"
                    variant="outlined"
                    fullWidth
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    margin="normal"
                />
                {loading && <CircularProgress />}
                {error && <Typography color="error">{`Error: ${error}`}</Typography>}
                <List>
                    {candidates.map((candidate, index) => (
                        <ListItem key={index} button onClick={() => handleCandidateCheck(candidate)}>
                            <Checkbox
                                checked={checkedCandidates.includes(candidate)}
                                onChange={() => handleCandidateCheck(candidate)}
                            />
                            <ListItemText
                                primary={<Link href={`https://www.wikidata.org/wiki/${candidate.id}`} target="_blank">{candidate.name}</Link>}
                                secondary={`${candidate.description} - Types: ${candidate.types.map(type => type.name).join(', ')}`}
                            />
                        </ListItem>
                    ))}
                </List>
                {checkedCandidates.length > 0 && (
                    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000 }}>
                        <Button variant="contained" color="primary" onClick={handleConfirmSelection}>
                            Confirm Selection
                        </Button>
                    </div>
                )}
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>#</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell>Score</TableCell>
                            <TableCell>Winner</TableCell>
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
                        {selectedCandidates.length > 0 && (
                            <>
                                <TableRow>
                                    <TableCell colSpan={6}>
                                        <Typography variant="h6" color="primary">Selected Candidates from Real-time Search</Typography>
                                    </TableCell>
                                </TableRow>
                                {selectedCandidates.map((candidate, index) => (
                                    <TableRow key={`selected-${index}`}>
                                        <TableCell>{data.length + index + 1}</TableCell>
                                        <TableCell>
                                            <Link href={`https://www.wikidata.org/wiki/${candidate.id}`} target="_blank">
                                                {candidate.name}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{candidate.types.map(t => t.name).join(', ')}</TableCell>
                                        <TableCell>{candidate.description}</TableCell>
                                        <TableCell>-</TableCell>
                                        <TableCell>-</TableCell>
                                    </TableRow>
                                ))}
                            </>
                        )}
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