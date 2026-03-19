import React from 'react'
import { Box, Typography, Button } from '@mui/material'

interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f0eb' }}>
        <Box sx={{ textAlign: 'center', maxWidth: 400, p: 4, bgcolor: '#fff', borderRadius: 3, border: '1px solid #e5ddd5', boxShadow: '0 4px 24px rgba(61,44,36,0.08)' }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#3d2c24', mb: 1 }}>Something went wrong</Typography>
          <Typography sx={{ fontSize: 13, color: '#b0a69d', mb: 3 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()} sx={{ mb: 1.5 }}>
            Reload
          </Button>
          <Typography sx={{ fontSize: 11, color: '#b0a69d' }}>
            If this persists, try a different address
          </Typography>
        </Box>
      </Box>
    )
  }
}
