import { Tooltip, Box } from '@mui/material'
import { GLOSSARY } from '../utils/glossary'

interface Props {
  term: string
  children: React.ReactNode
}

export default function GlossaryTerm({ term, children }: Props) {
  const definition = GLOSSARY[term]
  if (!definition) return <>{children}</>

  return (
    <Tooltip title={definition} arrow placement="top">
      <Box
        component="span"
        sx={{
          borderBottom: '1px dotted',
          borderColor: 'text.disabled',
          cursor: 'help',
        }}
      >
        {children}
      </Box>
    </Tooltip>
  )
}
