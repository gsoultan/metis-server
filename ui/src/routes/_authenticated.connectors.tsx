import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

/**
 * Which of the connector pages is showing. Each has its own entry under
 * Connectors in the sidebar; an unknown or missing value is the catalogue.
 */
export const CONNECTOR_SECTIONS = ['catalogue', 'connections', 'documents', 'outgoing', 'incoming'] as const
export type ConnectorSection = (typeof CONNECTOR_SECTIONS)[number]

const connectorsSearchSchema = z.object({
  section: z.enum(CONNECTOR_SECTIONS).optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/connectors')({
  validateSearch: (search) => connectorsSearchSchema.parse(search),
})
