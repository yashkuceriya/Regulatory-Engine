import React, { useState } from 'react'
import {
  AppBar, Toolbar, Box, Typography, Button, TextField, InputAdornment,
  Avatar, Chip, Card, CardContent,
  Stack, Alert, CircularProgress, Fab, Tooltip, Collapse, IconButton,
  Menu, MenuItem, ListItemIcon, ListItemText, Divider,
} from '@mui/material'
import {
  Search, Home, CheckCircle,
  LocationOn, Assessment, Map as MapIcon, Description, AutoAwesome,
  Tune, ExpandMore, History, CompareArrows, Architecture,
  Person, Logout, HelpOutline, Info,
  Storage, ErrorOutline, Refresh,
} from '@mui/icons-material'
import ErrorBoundary from './components/ErrorBoundary'
import AssessmentFullPage from './components/AssessmentFullPage'
import AssessmentSkeleton from './components/AssessmentSkeleton'
import PipelineStatus from './components/PipelineStatus'
import ChatPanel from './components/ChatPanel'
import ZoningMapView from './components/ZoningMapView'
import DashboardView from './components/DashboardView'
import CompareView from './components/CompareView'
import HistoryDrawer from './components/HistoryDrawer'
import AssessmentWizard from './components/AssessmentWizard'
import GlossaryTerm from './components/GlossaryTerm'
import { useAssessment, useDemoAddresses } from './hooks/useAssessment'
import { useAssessmentHistory } from './hooks/useAssessmentHistory'
import type { AssessmentParams } from './hooks/useAssessment'
import type { BuildabilityAssessment } from './types/assessment'

type AppView = 'dashboard' | 'assessments' | 'zoning-map' | 'compare'

export default function App() {
  const [assessment, setAssessment] = useState<BuildabilityAssessment | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [view, setView] = useState<AppView>('assessments')
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)
  const [projectParams, setProjectParams] = useState<{ sqft: string; beds: string; baths: string }>({ sqft: '', beds: '', baths: '' })
  const [showParams, setShowParams] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [avatarAnchor, setAvatarAnchor] = useState<null | HTMLElement>(null)
  const [searchError, setSearchError] = useState('')
  const { history, saveAssessment, loadAssessment, clearHistory } = useAssessmentHistory()
  const mutation = useAssessment()
  const {
    data: demoAddresses,
    isError: demoAddressesError,
  } = useDemoAddresses()

  const handleSearch = (address?: string) => {
    const addr = address || searchValue.trim()
    if (addr.length < 5) {
      if (!address) setSearchError('Enter a full LA street address')
      return
    }
    setSearchError('')
    setView('assessments')
    setPendingQuery(addr)
    const params: AssessmentParams = { address: addr }
    if (projectParams.sqft) params.target_sqft = Number(projectParams.sqft)
    if (projectParams.beds) params.bedrooms = Number(projectParams.beds)
    if (projectParams.baths) params.bathrooms = Number(projectParams.baths)
    mutation.mutate(params, {
      onSuccess: (data) => {
        setAssessment(data)
        saveAssessment(data)
        setPendingQuery(null)
      },
      onError: () => {
        setPendingQuery(null)
      },
    })
  }

  const isOOJ = assessment?.pipeline_errors?.some(e => e.step === 'boundary')
  const hasResults = assessment && !isOOJ && assessment.assessments.length > 0

  return (
    <ErrorBoundary>
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {/* ── App Bar ── */}
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: '48px !important', px: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              onClick={() => { setView('assessments'); setAssessment(null) }}
              sx={{
                width: 28, height: 28, borderRadius: 1.5, cursor: 'pointer',
                background: 'linear-gradient(135deg, #3d2c24, #5a4238)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', '&:hover': { transform: 'scale(1.08)', boxShadow: '0 2px 8px rgba(61,44,36,0.2)' },
              }}
            >
              <Home sx={{ color: 'white', fontSize: 16 }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: 14, color: 'primary.main', letterSpacing: '-0.3px' }}>
              Cover
            </Typography>
            <Chip label="Regulatory Engine" size="small" sx={{ height: 18, fontSize: '0.5rem', fontWeight: 600, bgcolor: '#f0ebe5', color: '#7a6e65', cursor: 'default' }} />
          </Box>

          <Stack direction="row" spacing={0.2} sx={{ ml: 2 }}>
            {([
              { label: 'Dashboard', icon: <Assessment sx={{ fontSize: 14 }} />, key: 'dashboard' as AppView },
              { label: 'Assessments', icon: <Description sx={{ fontSize: 14 }} />, key: 'assessments' as AppView },
              { label: 'Map', icon: <MapIcon sx={{ fontSize: 14 }} />, key: 'zoning-map' as AppView },
              { label: 'Compare', icon: <CompareArrows sx={{ fontSize: 14 }} />, key: 'compare' as AppView },
            ]).map((n) => (
              <Button
                key={n.label} size="small" startIcon={n.icon}
                onClick={() => setView(n.key)}
                sx={{
                  color: view === n.key ? 'primary.main' : 'text.disabled',
                  bgcolor: view === n.key ? 'rgba(61,44,36,0.05)' : 'transparent',
                  fontSize: '0.75rem', px: 1.2, py: 0.5, borderRadius: 1.5, minHeight: 32,
                  borderBottom: view === n.key ? '2px solid' : '2px solid transparent',
                  borderBottomColor: view === n.key ? 'primary.main' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(61,44,36,0.04)', color: 'primary.main' },
                }}
              >
                {n.label}
              </Button>
            ))}
          </Stack>

          <Box sx={{ flex: 1, maxWidth: 380, ml: 'auto' }}>
            <TextField
              fullWidth size="small" placeholder="Enter an LA address..."
              autoFocus={!assessment}
              value={searchValue}
              onChange={e => { setSearchValue(e.target.value); if (searchError) setSearchError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              disabled={mutation.isPending}
              error={!!searchError}
              helperText={searchError}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 15, color: '#b0a69d' }} /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <Button
                      variant="contained" size="small"
                      onClick={() => handleSearch()}
                      disabled={mutation.isPending || searchValue.trim().length < 5}
                      sx={{ minWidth: 64, fontSize: '0.7rem', py: 0.2, borderRadius: 1.5, boxShadow: 'none' }}
                    >
                      {mutation.isPending ? <CircularProgress size={14} color="inherit" /> : 'Assess'}
                    </Button>
                  </InputAdornment>
                ),
                sx: { fontSize: '0.75rem', borderRadius: 1.5, bgcolor: '#f5f0eb' },
              }}
            />
          </Box>
          <Tooltip title="Assessment history">
            <IconButton size="small" onClick={() => setHistoryOpen(true)} sx={{ p: 0.5 }}>
              <History sx={{ fontSize: 16, color: history.length > 0 ? 'primary.main' : 'text.disabled' }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Project parameters">
            <IconButton size="small" onClick={() => setShowParams(!showParams)} sx={{ p: 0.5 }}>
              <Tune sx={{ fontSize: 16, color: showParams ? 'primary.main' : 'text.disabled' }} />
            </IconButton>
          </Tooltip>
          <Avatar
            onClick={(e) => setAvatarAnchor(e.currentTarget)}
            sx={{ width: 28, height: 28, bgcolor: '#3d2c24', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', '&:hover': { bgcolor: '#5a4238', boxShadow: '0 0 0 2px #e5ddd5' } }}
          >Y</Avatar>
          <Menu
            anchorEl={avatarAnchor}
            open={!!avatarAnchor}
            onClose={() => setAvatarAnchor(null)}
            PaperProps={{
              sx: {
                width: 240, mt: 1, borderRadius: 2, border: '1px solid #e5ddd5',
                boxShadow: '0 8px 24px rgba(61,44,36,0.12)',
              },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            {/* Profile header */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar sx={{ width: 36, height: 36, bgcolor: '#3d2c24', fontSize: 14, fontWeight: 700 }}>Y</Avatar>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#3d2c24' }}>Yash</Typography>
                  <Typography sx={{ fontSize: 10, color: '#b0a69d' }}>Developer</Typography>
                </Box>
              </Stack>
            </Box>
            <Divider />
            <MenuItem onClick={() => { setView('dashboard'); setAvatarAnchor(null) }}>
              <ListItemIcon><Person sx={{ fontSize: 18, color: '#7a6e65' }} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Profile</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { setView('dashboard'); setAvatarAnchor(null) }}>
              <ListItemIcon><Assessment sx={{ fontSize: 18, color: '#7a6e65' }} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Dashboard</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { setHistoryOpen(true); setAvatarAnchor(null) }}>
              <ListItemIcon><History sx={{ fontSize: 18, color: '#7a6e65' }} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Assessment History</ListItemText>
              {history.length > 0 && <Chip label={history.length} size="small" sx={{ height: 18, fontSize: '0.5rem', bgcolor: '#f0ebe5', color: '#7a6e65' }} />}
            </MenuItem>
            <MenuItem onClick={() => { setShowParams(!showParams); setAvatarAnchor(null) }}>
              <ListItemIcon><Tune sx={{ fontSize: 18, color: '#7a6e65' }} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Project Parameters</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => setAvatarAnchor(null)}>
              <ListItemIcon><Storage sx={{ fontSize: 18, color: '#7a6e65' }} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Data Sources</ListItemText>
              <Chip label="6" size="small" sx={{ height: 16, fontSize: '0.45rem', bgcolor: '#dcfce7', color: '#166534' }} />
            </MenuItem>
            <MenuItem onClick={() => setAvatarAnchor(null)}>
              <ListItemIcon><HelpOutline sx={{ fontSize: 18, color: '#7a6e65' }} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Help & Docs</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => setAvatarAnchor(null)}>
              <ListItemIcon><Info sx={{ fontSize: 18, color: '#7a6e65' }} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 13 }}>About</ListItemText>
              <Typography sx={{ fontSize: 10, color: '#b0a69d' }}>v0.1.0</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => setAvatarAnchor(null)}>
              <ListItemIcon><Logout sx={{ fontSize: 18, color: '#b94a3e' }} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 13, color: '#b94a3e' }}>Sign Out</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
        <Collapse in={showParams}>
          <Box sx={{ px: 3, py: 1, bgcolor: '#fafafa', borderTop: '1px solid #f0ebe5', display: 'flex', gap: 2, alignItems: 'center' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#7a6e65', whiteSpace: 'nowrap' }}>Project Inputs</Typography>
            <TextField
              size="small" placeholder="Target sqft" type="number"
              value={projectParams.sqft} onChange={e => setProjectParams(p => ({ ...p, sqft: e.target.value }))}
              sx={{ width: 110, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 28 } }}
            />
            <TextField
              size="small" placeholder="Bedrooms" type="number"
              value={projectParams.beds} onChange={e => setProjectParams(p => ({ ...p, beds: e.target.value }))}
              sx={{ width: 90, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 28 } }}
            />
            <TextField
              size="small" placeholder="Bathrooms" type="number"
              value={projectParams.baths} onChange={e => setProjectParams(p => ({ ...p, baths: e.target.value }))}
              sx={{ width: 100, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 28 } }}
            />
            <Typography sx={{ fontSize: 10, color: '#b0a69d', ml: 1 }}>
              Optional — refines ADU impact fee and size calculations
            </Typography>
          </Box>
        </Collapse>
      </AppBar>

      {mutation.isPending && <PipelineStatus query={pendingQuery} />}

      {isOOJ && (
        <Alert severity="warning" variant="filled" sx={{ borderRadius: 0, py: 0.3, fontSize: '0.8rem' }}>
          Outside LA City Limits — Zoning data not available for this jurisdiction
        </Alert>
      )}

      {/* ── Main ── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {view === 'dashboard' ? (
          <DashboardView lastAssessment={assessment} />
        ) : view === 'zoning-map' ? (
          <ZoningMapView onSelectAddress={(a) => { setSearchValue(a); setView('assessments'); handleSearch(a) }} />
        ) : view === 'compare' ? (
          <CompareView />
        ) : mutation.isPending ? (
          <AssessmentSkeleton />
        ) : mutation.isError ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
            <Card sx={{ maxWidth: 400, textAlign: 'center', p: 4, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <ErrorOutline sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
              <Typography sx={{ fontSize: 18, fontWeight: 700, color: 'text.primary', mb: 1 }}>Assessment Failed</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 3, lineHeight: 1.7 }}>
                {mutation.error?.message || 'Something went wrong while processing the assessment.'}
              </Typography>
              <Button
                variant="contained" startIcon={<Refresh />}
                onClick={() => handleSearch()}
                sx={{ mb: 1.5 }}
              >
                Try Again
              </Button>
              <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
                Check the address format or try a nearby street
              </Typography>
            </Card>
          </Box>
        ) : hasResults ? (
          <AssessmentFullPage assessment={assessment!} onBack={() => setAssessment(null)} />
        ) : (
          <LandingPage
            demoAddresses={demoAddresses}
            demoError={demoAddressesError}
            onOpenMapView={() => setView('zoning-map')}
            onOpenWizard={() => setWizardOpen(true)}
            onSelect={(a) => { setSearchValue(a); handleSearch(a) }}
            isLoading={mutation.isPending}
          />
        )}
      </Box>

      {hasResults && (
        <>
          <Tooltip title="Ask follow-up questions">
            <Fab
              size="medium"
              onClick={() => setChatOpen(true)}
              sx={{
                position: 'fixed', bottom: 48, right: 24, zIndex: 1000,
                bgcolor: '#3d2c24', color: 'white',
                boxShadow: '0 4px 14px rgba(61,44,36,0.3)',
                '&:hover': { bgcolor: '#5a4238' },
              }}
            >
              <AutoAwesome />
            </Fab>
          </Tooltip>
          <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} assessment={assessment!} />
        </>
      )}

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={history}
        onSelect={(id) => {
          const loaded = loadAssessment(id)
          if (loaded) { setAssessment(loaded); setView('assessments') }
          setHistoryOpen(false)
        }}
        onClear={clearHistory}
      />

      <AssessmentWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        isLoading={mutation.isPending}
        onSubmit={(params) => {
          setSearchValue(params.address)
          setView('assessments')
          mutation.mutate(params, {
            onSuccess: (data) => {
              setAssessment(data)
              saveAssessment(data)
              setWizardOpen(false)
            },
            onError: () => {},
          })
        }}
      />

      <Box sx={{
        px: 3, py: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
      }}>
        <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
          Cover Regulatory Engine — Preliminary analysis only, subject to professional verification
        </Typography>
        <Stack direction="row" spacing={1.5}>
          <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>LA City</Typography>
          <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>R1/R2 + <GlossaryTerm term="ADU">ADU</GlossaryTerm></Typography>
          <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Evidence-backed</Typography>
        </Stack>
      </Box>
    </Box>
    </ErrorBoundary>
  )
}

/* ── Landing / Property Search Page ── */
function LandingPage({ demoAddresses, demoError, onOpenMapView, onOpenWizard, onSelect, isLoading }: {
  demoAddresses?: any[]
  demoError?: boolean
  onOpenMapView: () => void
  onOpenWizard: () => void
  onSelect: (a: string) => void
  isLoading: boolean
}) {
  return (
    <Box sx={{ flex: 1, display: 'flex', bgcolor: '#f5f0eb' }}>
      {/* Left column */}
      <Box sx={{ flex: 1, p: { xs: 3, md: '36px 44px' }, maxWidth: 640, overflowY: 'auto' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3.5 }}>
          <Box>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#3d2c24', mb: 0.3, letterSpacing: '-0.3px' }}>Property Search</Typography>
            <Typography sx={{ fontSize: 13, color: '#7a6e65' }}>
              Analyze regulatory constraints by LA street address.
            </Typography>
          </Box>
          <Button
            variant="contained" onClick={onOpenWizard}
            startIcon={<Architecture sx={{ fontSize: 16 }} />}
            sx={{ fontSize: 12, px: 2.5, py: 1, borderRadius: 2, flexShrink: 0 }}
          >
            New Assessment
          </Button>
        </Stack>

        {demoError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Demo scenarios could not be loaded. You can still enter an LA address manually.
          </Alert>
        )}

        {/* Demo parcels */}
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.8px', mb: 1 }}>
          Suggested Demo Parcels
        </Typography>
        <Stack spacing={0.8} sx={{ mb: 3 }}>
          {(demoAddresses || []).slice(0, 3).map((d, i) => (
            <Box
              key={i}
              onClick={() => !isLoading && onSelect(d.address)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2,
                border: '1px solid #e5ddd5', bgcolor: '#fff',
                cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1,
                transition: 'all 0.15s',
                '&:hover': { borderColor: '#3d2c24', boxShadow: '0 2px 8px rgba(61,44,36,0.06)' },
              }}
            >
              <Box sx={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                bgcolor: i === 0 ? '#3d2c24' : '#f0ebe5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <LocationOn sx={{ fontSize: 16, color: i === 0 ? '#fff' : '#7a6e65' }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#5a4238' }}>{d.address}</Typography>
                <Typography sx={{ fontSize: 10, color: '#b0a69d' }}>{d.scenario}</Typography>
              </Box>
              <Chip label={i === 0 ? 'Baseline' : i === 1 ? 'Overlay' : 'Edge case'}
                size="small" sx={{
                  height: 20, fontSize: '0.5rem', fontWeight: 600,
                  bgcolor: i === 0 ? '#dcfce7' : i === 1 ? '#fef3c7' : '#dbeafe',
                  color: i === 0 ? '#166534' : i === 1 ? '#92400e' : '#1e40af',
                }} />
            </Box>
          ))}
        </Stack>

        {/* Current Scope */}
        <Card sx={{ mb: 3, border: '1px solid #e5ddd5' }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#16a34a' }} />
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#3d2c24', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Current POC Scope</Typography>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              {[
                { label: <>Zoning Height & <GlossaryTerm term="FAR">FAR</GlossaryTerm> Limits</>, key: 'far', icon: <CheckCircle sx={{ fontSize: 12 }} /> },
                { label: 'R1 / R2 Frontage Setbacks', key: 'setbacks', icon: <CheckCircle sx={{ fontSize: 12 }} /> },
                { label: <>State Law <GlossaryTerm term="ADU">ADU</GlossaryTerm> Eligibility</>, key: 'adu', icon: <CheckCircle sx={{ fontSize: 12 }} /> },
                { label: 'Overlay Detection & Flags', key: 'overlays', icon: <CheckCircle sx={{ fontSize: 12 }} /> },
              ].map(s => (
                <Stack key={s.key} direction="row" spacing={0.8} alignItems="center">
                  <Box sx={{ color: '#16a34a' }}>{s.icon}</Box>
                  <Typography sx={{ fontSize: 10.5, color: '#6b5d54' }}>{s.label}</Typography>
                </Stack>
              ))}
            </Box>
          </CardContent>
        </Card>

        {/* Stats row */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5, mb: 3 }}>
          <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #e5ddd5' }}>
            <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rule Coverage</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#3d2c24', mt: 0.5 }}>42%</Typography>
            <Typography sx={{ fontSize: 10, color: '#7a6e65' }}>Ready for R1/R2</Typography>
          </Box>
          <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #e5ddd5' }}>
            <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>State Law ADU</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#16a34a', mt: 0.5 }}>Qualified</Typography>
            <Typography sx={{ fontSize: 10, color: '#7a6e65' }}>Ready for check</Typography>
          </Box>
        </Box>

        {/* Recent / more addresses */}
        {demoAddresses && demoAddresses.length > 3 && (
          <>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.8px', mb: 1 }}>
              More Parcels
            </Typography>
            <Stack spacing={0.5}>
              {demoAddresses.slice(3).map((d, i) => (
                <Box key={i} onClick={() => !isLoading && onSelect(d.address)}
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    p: 1.2, borderRadius: 1.5, border: '1px solid #e5ddd5', bgcolor: '#fff',
                    cursor: 'pointer', transition: 'all 0.15s',
                    '&:hover': { borderColor: '#3d2c24' },
                  }}>
                  <Box>
                    <Typography sx={{ fontSize: 11.5, fontWeight: 500, color: '#5a4238' }}>{d.address}</Typography>
                    <Typography sx={{ fontSize: 9.5, color: '#b0a69d' }}>{d.scenario}</Typography>
                  </Box>
                  <Button size="small" variant="outlined" sx={{ fontSize: '0.6rem', minWidth: 55, height: 22, borderColor: '#e5ddd5', color: '#7a6e65' }}>
                    Analyze
                  </Button>
                </Box>
              ))}
            </Stack>
          </>
        )}
      </Box>

      {/* Right column — Live Map Preview */}
      <Box sx={{
        flex: 1, position: 'relative', overflow: 'hidden',
        borderLeft: '1px solid #e5ddd5',
      }}>
        <MiniMapPreview onOpenMapView={onOpenMapView} />
      </Box>
    </Box>
  )
}

/* ── Mini Map Preview for Landing Page ── */
function MiniMapPreview({ onOpenMapView }: { onOpenMapView: () => void }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapToken = (import.meta as any).env?.VITE_MAPBOX_TOKEN || ''

  React.useEffect(() => {
    if (!containerRef.current || !mapToken) return
    let map: any = null
    import('mapbox-gl').then((mapboxgl) => {
      mapboxgl.default.accessToken = mapToken
      map = new mapboxgl.default.Map({
        container: containerRef.current!,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-118.35, 34.05],
        zoom: 11,
        interactive: true,
        attributionControl: false,
      })
      map.addControl(new mapboxgl.default.NavigationControl({ showCompass: false }), 'bottom-right')
    })
    return () => { if (map) map.remove() }
  }, [mapToken])

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      {mapToken ? (
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Box sx={{
          width: '100%', height: '100%', bgcolor: '#f0ebe5',
          backgroundImage: 'radial-gradient(#d4c8be 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }} />
      )}

      {/* Floating card overlay */}
      <Box sx={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)',
        borderRadius: 3, p: 3, textAlign: 'center', maxWidth: 280,
        border: '1px solid rgba(229,221,213,0.8)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      }}>
        <Box sx={{
          width: 56, height: 56, borderRadius: '50%', mx: 'auto', mb: 2,
          bgcolor: '#3d2c24', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LocationOn sx={{ fontSize: 24, color: '#fff' }} />
        </Box>
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#3d2c24', mb: 0.5 }}>Location Picker</Typography>
        <Typography sx={{ fontSize: 12, color: '#7a6e65', lineHeight: 1.7, mb: 2.5 }}>
          Select a parcel directly on the map or use the address search to pinpoint a specific regulatory zone.
        </Typography>
        <Button
          variant="contained" onClick={onOpenMapView} fullWidth
          startIcon={<LocationOn sx={{ fontSize: 16 }} />}
          sx={{ fontSize: '0.8rem', py: 1, borderRadius: 2 }}
        >
          Open Map View
        </Button>
        <Typography sx={{ fontSize: 10, color: '#b0a69d', mt: 1.5, cursor: 'pointer', '&:hover': { color: '#7a6e65' } }}>
          How it works
        </Typography>
      </Box>
    </Box>
  )
}
