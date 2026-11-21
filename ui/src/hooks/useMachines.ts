import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { machineService } from '../services/domains/machineService';
import { useAppStore } from '../store/useAppStore';

const machinesKey = ['machines'] as const;

/** The machines running this server, asked again every 15 seconds, as often as each says it runs. */
export function useMachines() {
  const token = useAppStore((state) => state.token);
  return useQuery({
    queryKey: machinesKey,
    queryFn: ({ signal }) => machineService.list(signal),
    enabled: !!token,
    refetchInterval: 15_000,
  });
}

export function useForgetMachine() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => machineService.forget(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: machinesKey }),
  });
}
