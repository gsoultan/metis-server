import { createLazyFileRoute } from '@tanstack/react-router'
import { Environments } from '../pages/Environments'

export const Route = createLazyFileRoute('/_authenticated/environments')({
  component: Environments,
})
