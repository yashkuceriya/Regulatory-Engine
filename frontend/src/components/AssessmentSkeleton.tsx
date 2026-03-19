import { Box, Skeleton, Stack } from '@mui/material'

export default function AssessmentSkeleton() {
  return (
    <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'background.default' }}>
      <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 3, md: 5 }, py: 4 }}>
        {/* Breadcrumbs */}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Skeleton variant="text" width={60} height={20} />
          <Skeleton variant="text" width={80} height={20} />
        </Stack>

        {/* Hero header */}
        <Box sx={{ mb: 4, pb: 4, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Skeleton variant="text" width={320} height={48} sx={{ mb: 1 }} />
          <Stack direction="row" spacing={1.5}>
            <Skeleton variant="rounded" width={100} height={24} />
            <Skeleton variant="rounded" width={80} height={24} />
            <Skeleton variant="rounded" width={120} height={24} />
          </Stack>
        </Box>

        {/* Map + sidebar grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3, mb: 3 }}>
          <Skeleton variant="rounded" height={480} animation="wave" sx={{ borderRadius: 3 }} />
          <Stack spacing={3}>
            <Skeleton variant="rounded" height={280} animation="wave" sx={{ borderRadius: 3 }} />
            <Skeleton variant="rounded" height={180} animation="wave" sx={{ borderRadius: 3 }} />
          </Stack>
        </Box>

        {/* Overlay risk matrix */}
        <Skeleton variant="rounded" height={160} animation="wave" sx={{ borderRadius: 3, mb: 3 }} />

        {/* Envelope viz */}
        <Skeleton variant="rounded" height={320} animation="wave" sx={{ borderRadius: 3, mb: 3 }} />

        {/* Cover fit cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
          <Skeleton variant="rounded" height={200} animation="wave" sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" height={200} animation="wave" sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" height={200} animation="wave" sx={{ borderRadius: 3 }} />
        </Box>

        {/* Findings tabs */}
        <Skeleton variant="rounded" height={300} animation="wave" sx={{ borderRadius: 3 }} />
      </Box>
    </Box>
  )
}
