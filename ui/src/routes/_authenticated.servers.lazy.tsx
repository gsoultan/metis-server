import { createLazyFileRoute } from '@tanstack/react-router'
import { Servers } from '../pages/Servers'

export const Route = createLazyFileRoute('/_authenticated/servers')({
  component: Servers,
})
