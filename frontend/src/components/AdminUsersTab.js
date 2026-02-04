import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUsers,
  updateAdminUser
} from '../services/apiServices';

const AdminUsersTab = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [draftRoles, setDraftRoles] = useState({});
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    role: 'user'
  });

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getAdminUsers();
      const nextUsers = response?.users || [];
      setUsers(nextUsers);
      const roleState = {};
      nextUsers.forEach((user) => {
        roleState[user.email] = user.role || 'user';
      });
      setDraftRoles(roleState);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async () => {
    setError(null);
    setSuccess(null);
    try {
      await createAdminUser({
        email: createForm.email,
        password: createForm.password,
        role: createForm.role
      });
      setCreateForm({ email: '', password: '', role: 'user' });
      setSuccess('User created.');
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to create user.');
    }
  };

  const handleSaveRole = async (email) => {
    const role = draftRoles[email] || 'user';
    setError(null);
    setSuccess(null);
    try {
      await updateAdminUser(email, { role });
      setSuccess(`Role updated for ${email}.`);
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to update role.');
    }
  };

  const handleResetPassword = async (email) => {
    const password = (passwordDrafts[email] || '').trim();
    if (!password) {
      setError('Please type a new password before saving.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await updateAdminUser(email, { password });
      setPasswordDrafts((prev) => ({ ...prev, [email]: '' }));
      setSuccess(`Password updated for ${email}.`);
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to update password.');
    }
  };

  const handleDeleteUser = async (email) => {
    const shouldDelete = window.confirm(`Delete user ${email}?`);
    if (!shouldDelete) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteAdminUser(email);
      setSuccess(`User ${email} deleted.`);
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to delete user.');
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Create user</Typography>
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={5}>
            <TextField
              label="Email"
              type="email"
              fullWidth
              value={createForm.email}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Password"
              type="text"
              fullWidth
              value={createForm.password}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                label="Role"
                value={createForm.role}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value }))}
              >
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={1}>
            <Button
              variant="contained"
              fullWidth
              onClick={handleCreateUser}
              disabled={!createForm.email.trim() || !createForm.password.trim()}
            >
              Add
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Manage users</Typography>
        {loading ? (
          <Typography variant="body2">Loading users...</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Password hash</TableCell>
                  <TableCell>Set password</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.email}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 100 }}>
                          <Select
                            value={draftRoles[user.email] || 'user'}
                            onChange={(e) => setDraftRoles((prev) => ({ ...prev, [user.email]: e.target.value }))}
                          >
                            <MenuItem value="user">User</MenuItem>
                            <MenuItem value="admin">Admin</MenuItem>
                          </Select>
                        </FormControl>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<SaveIcon />}
                          onClick={() => handleSaveRole(user.email)}
                        >
                          Save
                        </Button>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography
                        variant="caption"
                        sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                      >
                        {user.password_hash || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          size="small"
                          type="text"
                          placeholder="New password"
                          value={passwordDrafts[user.email] || ''}
                          onChange={(e) => setPasswordDrafts((prev) => ({ ...prev, [user.email]: e.target.value }))}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleResetPassword(user.email)}
                        >
                          Set
                        </Button>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        startIcon={<DeleteIcon />}
                        onClick={() => handleDeleteUser(user.email)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Stack>
  );
};

export default AdminUsersTab;
